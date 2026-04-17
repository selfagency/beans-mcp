import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import * as graphql from '../internal/graphql';
import type { BeanRecord, GraphQLError } from '../types';
import { isPathWithinRoot } from '../utils';

const execFileAsync = promisify(execFile);

/**
 * Interface for backend implementations.
 * Allows for alternative implementations (e.g., test harnesses).
 */
export interface BackendInterface {
  init(prefix?: string): Promise<Record<string, unknown>>;
  archive?(): Promise<Record<string, unknown>>;
  queryGraphql?(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data: unknown; errors?: GraphQLError[] }>;
  list(options?: { status?: string[]; type?: string[]; search?: string }): Promise<BeanRecord[]>;
  create(input: {
    title: string;
    type: string;
    status?: string;
    priority?: string;
    /** Body markdown content. `description` is a deprecated alias. */
    body?: string;
    description?: string;
    parent?: string;
  }): Promise<BeanRecord>;
  update(
    beanId: string,
    updates: {
      status?: string;
      type?: string;
      priority?: string;
      parent?: string;
      clearParent?: boolean;
      blocking?: string[];
      blockedBy?: string[];
      body?: string;
      bodyAppend?: string;
      bodyReplace?: Array<{ old: string; new: string }>;
      ifMatch?: string;
    },
  ): Promise<BeanRecord>;
  delete(beanId: string): Promise<Record<string, unknown>>;
  bulkCreate(
    beans: Array<{
      title: string;
      type: string;
      status?: string;
      priority?: string;
      body?: string;
      description?: string;
      parent?: string;
    }>,
    defaultParent?: string,
  ): Promise<Array<{ bean?: BeanRecord; error?: string }>>;
  bulkUpdate(
    beans: Array<{
      beanId: string;
      status?: string;
      type?: string;
      priority?: string;
      parent?: string;
      clearParent?: boolean;
      blocking?: string[];
      blockedBy?: string[];
      body?: string;
      bodyAppend?: string;
      bodyReplace?: Array<{ old: string; new: string }>;
      ifMatch?: string;
    }>,
    defaultParent?: string,
  ): Promise<Array<{ beanId: string; bean?: BeanRecord; error?: string }>>;
  openConfig(): Promise<{ configPath: string; content: string }>;
  primeInstructions?(): Promise<string>;
  writeInstructions?(instructions: string): Promise<string | null>;
  graphqlSchema(): Promise<string>;
  readOutputLog(options?: { lines?: number }): Promise<{ path: string; content: string; linesReturned: number }>;
  readBeanFile(relativePath: string): Promise<{ path: string; content: string }>;
  editBeanFile(relativePath: string, content: string): Promise<{ path: string; bytes: number }>;
  updateBeanFrontmatter(
    relativePath: string,
    updates: {
      title?: string;
      status?: string;
      type?: string;
      priority?: string;
      parent_id?: string | null;
      tags?: string[] | null;
      blocking_ids?: string[] | null;
      blocked_by_ids?: string[] | null;
      pr?: string | null;
      branch?: string | null;
    },
  ): Promise<{
    path: string;
    bytes: number;
    updatedFields: string[];
    frontmatter: Record<string, string | string[]>;
  }>;
  createBeanFile(
    relativePath: string,
    content: string,
    options?: { overwrite?: boolean },
  ): Promise<{ path: string; bytes: number; created: boolean }>;
  deleteBeanFile(relativePath: string): Promise<{ path: string; deleted: boolean }>;
}

/**
 * Beans CLI backend implementation.
 * Wraps the Beans CLI and provides a typed interface for MCP tools.
 */
export class BeansCliBackend implements BackendInterface {
  constructor(
    private readonly workspaceRoot: string,
    private readonly cliPath: string,
    private readonly logDir?: string,
  ) {}

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------

  /** Full unfiltered records keyed by bean ID, stored under the fixed cache key `'all'`. */
  private readonly _cache = new Map<string, Map<string, BeanRecord>>();
  /** Last time the unfiltered cache entry `'all'` was fetched (ms). */
  private readonly _cacheTime = new Map<string, number>();
  /** Short-circuit TTL: skip even the timestamp check within this window (ms). */
  private static readonly BURST_TTL_MS = 5_000;

  /** Invalidate the unfiltered list cache so the next call does a full fetch. */
  private invalidateCache(): void {
    this._cache.delete('all');
    this._cacheTime.delete('all');
  }

  /**
   * Returns a safe environment for executing the Beans CLI,
   * whitelisting only necessary variables.
   */
  private getSafeEnv(): NodeJS.ProcessEnv {
    const whitelist = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SHELL'];
    const env: NodeJS.ProcessEnv = {};

    for (const key of whitelist) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }

    // Include BEANS_ variables
    for (const key in process.env) {
      if (key.startsWith('BEANS_')) {
        env[key] = process.env[key];
      }
    }

    return env;
  }

  private getBeansRoot(): string {
    return resolve(this.workspaceRoot, '.beans');
  }

  private resolveBeanFilePath(relativePath: string): string {
    // Strip leading slashes, then strip a leading .beans/ or exact .beans segment
    // so agents that accidentally include it still resolve correctly.
    const cleaned = relativePath
      .trim()
      .replace(/^\/+/, '')
      .replace(/^\.beans(?:[\\/]|$)/, '');
    if (!cleaned) {
      throw new Error('Path is required');
    }

    const beansRoot = this.getBeansRoot();
    const target = resolve(beansRoot, cleaned);

    if (!isPathWithinRoot(beansRoot, target)) {
      throw new Error('Path must stay within .beans directory');
    }

    return target;
  }

  /**
   * Execute a GraphQL query via the Beans CLI.
   */
  private async executeGraphQL<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data: T; errors?: GraphQLError[] }> {
    const args = ['graphql', '--json', query];

    if (variables) {
      args.push('--variables', JSON.stringify(variables));
    }

    const { stdout } = await execFileAsync(this.cliPath, args, {
      cwd: this.workspaceRoot,
      env: this.getSafeEnv(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    try {
      // CLI outputs the data portion directly (e.g. {"beans": [...]})
      // without a {"data": ...} envelope.
      return { data: JSON.parse(stdout) as T };
    } catch (error) {
      throw new Error(
        `Failed to parse Beans CLI GraphQL output: ${(error as Error).message}\nOutput: ${stdout.slice(0, 1000)}`,
      );
    }
  }

  async init(prefix?: string): Promise<Record<string, unknown>> {
    const args = ['init'];
    if (prefix) {
      args.push('--prefix', prefix);
    }
    await execFileAsync(this.cliPath, args, {
      cwd: this.workspaceRoot,
      env: this.getSafeEnv(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    return { initialized: true };
  }

  async archive(): Promise<Record<string, unknown>> {
    const { stdout } = await execFileAsync(this.cliPath, ['archive', '--json'], {
      cwd: this.workspaceRoot,
      env: this.getSafeEnv(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    this.invalidateCache();

    if (!stdout.trim()) {
      return { archived: true };
    }

    try {
      return JSON.parse(stdout) as Record<string, unknown>;
    } catch {
      return { archived: true, output: stdout.trim() };
    }
  }

  async queryGraphql(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data: unknown; errors?: GraphQLError[] }> {
    return this.executeGraphQL<unknown>(query, variables);
  }

  async list(options?: { status?: string[]; type?: string[]; search?: string }): Promise<BeanRecord[]> {
    const filter: { status?: string[]; type?: string[]; search?: string } = {};

    if (options?.status && options.status.length > 0) {
      filter.status = options.status;
    }

    if (options?.type && options.type.length > 0) {
      filter.type = options.type;
    }

    if (options?.search) {
      filter.search = options.search;
    }

    // Only cache unfiltered "list everything" calls — filtered/search calls
    // are cheap queries and must always reflect the latest state.
    const isCacheable = !filter.status && !filter.type && !filter.search;
    const cacheKey = 'all';

    if (isCacheable) {
      const lastFetch = this._cacheTime.get(cacheKey) ?? 0;
      const cached = this._cache.get(cacheKey);
      const age = Date.now() - lastFetch;

      // Within the burst window, skip even the timestamp check.
      if (cached && age < BeansCliBackend.BURST_TTL_MS) {
        return Array.from(cached.values());
      }

      // Outside the burst window, do a cheap timestamps-only fetch and compare.
      if (cached) {
        try {
          const { data: tsData } = await this.executeGraphQL<{ beans: Array<{ id: string; updatedAt?: string }> }>(
            graphql.LIST_BEANS_TIMESTAMPS_QUERY,
          );
          const timestamps = tsData.beans;
          let dirty = timestamps.length !== cached.size;
          if (!dirty) {
            for (const { id, updatedAt } of timestamps) {
              const existing = cached.get(id);
              if (!existing || existing.updatedAt !== updatedAt) {
                dirty = true;
                break;
              }
            }
          }
          if (!dirty) {
            // Nothing changed — return cached records and refresh the burst timer.
            this._cacheTime.set(cacheKey, Date.now());
            return Array.from(cached.values());
          }
        } catch {
          // Timestamp check failed — fall through to a full fetch.
        }
      }
    }

    const { data, errors } = await this.executeGraphQL<{ beans: BeanRecord[] }>(graphql.LIST_BEANS_QUERY, { filter });

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

    if (isCacheable) {
      const byId = new Map(data.beans.map(b => [b.id, b]));
      this._cache.set(cacheKey, byId);
      this._cacheTime.set(cacheKey, Date.now());
    }

    return data.beans;
  }

  async create(input: {
    title: string;
    type: string;
    status?: string;
    priority?: string;
    body?: string;
    description?: string;
    parent?: string;
  }): Promise<BeanRecord> {
    const createInput: Record<string, unknown> = {
      title: input.title,
      type: input.type,
      status: input.status,
      priority: input.priority,
      body: input.body ?? input.description,
      parent: input.parent,
    };

    const { data, errors } = await this.executeGraphQL<{ createBean: BeanRecord }>(graphql.CREATE_BEAN_MUTATION, {
      input: createInput,
    });

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

    this.invalidateCache();
    return data.createBean;
  }

  async update(
    beanId: string,
    updates: {
      status?: string;
      type?: string;
      priority?: string;
      parent?: string;
      clearParent?: boolean;
      blocking?: string[];
      blockedBy?: string[];
      body?: string;
      bodyAppend?: string;
      bodyReplace?: Array<{ old: string; new: string }>;
      ifMatch?: string;
    },
  ): Promise<BeanRecord> {
    const updateInput: Record<string, unknown> = {
      status: updates.status,
      type: updates.type,
      priority: updates.priority,
    };

    if (updates.parent !== undefined) {
      updateInput.parent = updates.parent;
    } else if (updates.clearParent) {
      updateInput.parent = '';
    }

    if (updates.blocking) {
      updateInput.addBlocking = updates.blocking;
    }

    if (updates.blockedBy) {
      updateInput.addBlockedBy = updates.blockedBy;
    }

    if (updates.body !== undefined) {
      updateInput.body = updates.body;
    }

    const bodyMod: { append?: string; replace?: Array<{ old: string; new: string }> } = {};
    if (updates.bodyAppend !== undefined) {
      bodyMod.append = updates.bodyAppend;
    }
    if (Array.isArray(updates.bodyReplace) && updates.bodyReplace.length > 0) {
      bodyMod.replace = updates.bodyReplace;
    }
    if (Object.keys(bodyMod).length > 0) {
      updateInput.bodyMod = bodyMod;
    }

    let data: { updateBean: BeanRecord };
    let errors: GraphQLError[] | undefined;

    if (updates.ifMatch) {
      try {
        const res = await this.executeGraphQL<{ updateBean: BeanRecord }>(graphql.UPDATE_BEAN_MUTATION_WITH_IF_MATCH, {
          id: beanId,
          input: updateInput,
          ifMatch: updates.ifMatch,
        });
        data = res.data;
        errors = res.errors;
      } catch (error) {
        const message = (error as Error).message || '';
        const unsupportedIfMatch =
          /unknown argument.*ifMatch|unknown field.*ifMatch|ifMatch.*not defined|field .*updateBean.* argument .*ifMatch/i.test(
            message,
          );

        if (!unsupportedIfMatch) {
          throw error;
        }

        // Best-effort compatibility fallback for older Beans CLI/schema versions.
        const fallback = await this.executeGraphQL<{ updateBean: BeanRecord }>(graphql.UPDATE_BEAN_MUTATION, {
          id: beanId,
          input: updateInput,
        });
        data = fallback.data;
        errors = fallback.errors;
      }
    } else {
      const res = await this.executeGraphQL<{ updateBean: BeanRecord }>(graphql.UPDATE_BEAN_MUTATION, {
        id: beanId,
        input: updateInput,
      });
      data = res.data;
      errors = res.errors;
    }

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

    this.invalidateCache();
    return data.updateBean;
  }

  async delete(beanId: string): Promise<Record<string, unknown>> {
    const { errors } = await this.executeGraphQL<{ deleteBean: boolean }>(graphql.DELETE_BEAN_MUTATION, {
      id: beanId,
    });

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

    this.invalidateCache();
    return { deleted: true, beanId };
  }

  async bulkCreate(
    beans: Array<{
      title: string;
      type: string;
      status?: string;
      priority?: string;
      body?: string;
      description?: string;
      parent?: string;
    }>,
    defaultParent?: string,
  ): Promise<Array<{ bean?: BeanRecord; error?: string }>> {
    const settled = await Promise.allSettled(
      beans.map(async item =>
        this.create({
          ...item,
          parent: item.parent ?? defaultParent,
        }),
      ),
    );

    return settled.map(result =>
      result.status === 'fulfilled'
        ? { bean: result.value }
        : { error: result.reason instanceof Error ? result.reason.message : String(result.reason) },
    );
  }

  async bulkUpdate(
    beans: Array<{
      beanId: string;
      status?: string;
      type?: string;
      priority?: string;
      parent?: string;
      clearParent?: boolean;
      blocking?: string[];
      blockedBy?: string[];
      body?: string;
      bodyAppend?: string;
      bodyReplace?: Array<{ old: string; new: string }>;
      ifMatch?: string;
    }>,
    defaultParent?: string,
  ): Promise<Array<{ beanId: string; bean?: BeanRecord; error?: string }>> {
    const settled = await Promise.allSettled(
      beans.map(async ({ beanId, ...updates }) => {
        const resolvedParent = updates.parent ?? (updates.clearParent ? undefined : defaultParent);
        const bean = await this.update(beanId, { ...updates, parent: resolvedParent });
        return { beanId, bean };
      }),
    );

    return settled.map((result, index) => {
      const beanId = beans[index]?.beanId;
      if (!beanId) {
        return { beanId: 'unknown', error: 'Unknown bean id' };
      }

      if (result.status === 'fulfilled') {
        return result.value;
      }

      return {
        beanId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });
  }

  async openConfig(): Promise<{ configPath: string; content: string }> {
    const configPath = join(this.workspaceRoot, '.beans.yml');
    const content = await readFile(configPath, 'utf8');
    return { configPath, content };
  }

  async primeInstructions(): Promise<string> {
    const { stdout } = await execFileAsync(this.cliPath, ['prime'], {
      cwd: this.workspaceRoot,
      env: this.getSafeEnv(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    return stdout.trim();
  }

  async writeInstructions(instructions: string): Promise<string> {
    const instructionsPath = join(this.workspaceRoot, '.github', 'instructions', 'beans-prime.instructions.md');
    await mkdir(dirname(instructionsPath), { recursive: true });
    await writeFile(instructionsPath, instructions, 'utf8');
    return instructionsPath;
  }

  async graphqlSchema(): Promise<string> {
    const { stdout } = await execFileAsync(this.cliPath, ['graphql', '--schema'], {
      cwd: this.workspaceRoot,
      env: this.getSafeEnv(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    return stdout.trim();
  }

  async readOutputLog(options?: { lines?: number }): Promise<{ path: string; content: string; linesReturned: number }> {
    const outputPath = resolve(
      process.env.BEANS_VSCODE_OUTPUT_LOG || join(this.workspaceRoot, '.vscode', 'logs', 'beans-output.log'),
    );

    const canonicalOutputPath = await realpath(outputPath).catch(() => outputPath);
    const canonicalWorkspaceRoot = await realpath(this.workspaceRoot).catch(() => resolve(this.workspaceRoot));

    const isWithinWorkspace = isPathWithinRoot(canonicalWorkspaceRoot, canonicalOutputPath);
    const vscodeLogDir =
      process.env.BEANS_VSCODE_LOG_DIR || this.logDir
        ? resolve(process.env.BEANS_VSCODE_LOG_DIR || this.logDir || '')
        : undefined;
    const canonicalVscodeLogDir = vscodeLogDir
      ? await realpath(vscodeLogDir).catch(() => resolve(vscodeLogDir))
      : undefined;
    const isWithinVscodeLogDir = canonicalVscodeLogDir
      ? isPathWithinRoot(canonicalVscodeLogDir, canonicalOutputPath)
      : false;

    if (!isWithinWorkspace && !isWithinVscodeLogDir) {
      throw new Error('Output log path must stay within the workspace or VS Code log directory');
    }

    const maxLines = options?.lines && options.lines > 0 ? options.lines : 500;
    const ringBuffer: string[] = [];

    const stream = createReadStream(outputPath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line) {
        continue;
      }

      ringBuffer.push(line);
      if (ringBuffer.length > maxLines) {
        ringBuffer.shift();
      }
    }

    return {
      path: outputPath,
      content: ringBuffer.join('\n'),
      linesReturned: ringBuffer.length,
    };
  }

  /**
   * Split a YAML scalar value from any trailing inline comment.
   * Understands single-quoted and double-quoted YAML strings so it won't
   * mistake a `#` inside a quoted value for a comment delimiter.
   */
  private splitYamlInlineComment(value: string): { valuePart: string; commentPart: string } {
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];

      if (inSingle) {
        if (char === "'") {
          if (value[i + 1] === "'") {
            i += 1; // '' is a YAML escaped single-quote — skip both chars
          } else {
            inSingle = false;
          }
        }
        continue;
      }

      if (inDouble) {
        if (char === '\\') {
          i += 1; // skip escape sequence second char
          continue;
        }
        if (char === '"') {
          inDouble = false;
        }
        continue;
      }

      if (char === "'") {
        inSingle = true;
        continue;
      }

      if (char === '"') {
        inDouble = true;
        continue;
      }

      // A '#' preceded by whitespace starts an inline comment (YAML spec requires whitespace before '#').
      if (char === '#' && i > 0 && /\s/.test(value[i - 1])) {
        const valuePart = value.slice(0, i).trimEnd();
        return {
          valuePart,
          commentPart: value.slice(valuePart.length),
        };
      }
    }

    return { valuePart: value, commentPart: '' };
  }

  /** Returns true when `value` looks like a YAML block scalar indicator (`>`, `|`, `>-`, `|-`, etc.) */
  private isYamlBlockScalarIndicator(value: string): boolean {
    return /^[>|][+-]?[0-9]*$/.test(value) || /^[>|][0-9]*[+-]?$/.test(value);
  }

  /** Escape a plain string for use inside a YAML double-quoted scalar. */
  private escapeForYamlDoubleQuoted(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private shouldQuoteFrontmatterValue(value: string): boolean {
    return !/^[A-Za-z0-9._-]+$/.test(value);
  }

  private serializeFrontmatterValue(key: string, value: string | string[]): string {
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }

    if (key === 'title') {
      return this.normalizeFrontmatterTitleValue(value);
    }

    if (this.shouldQuoteFrontmatterValue(value)) {
      return `"${this.escapeForYamlDoubleQuoted(value)}"`;
    }

    return value;
  }

  private deserializeFrontmatterValue(value: string): string | string[] {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
          return parsed;
        }
      } catch {
        // Fall through and return raw text.
      }
    }

    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/''/g, "'");
    }

    return trimmed;
  }

  private splitFrontmatterDocument(content: string): {
    eol: string;
    hasFrontmatter: boolean;
    frontmatterLines: string[];
    body: string;
  } {
    const crlfOpen = content.startsWith('---\r\n');
    const lfOpen = content.startsWith('---\n');
    const eol = crlfOpen ? '\r\n' : '\n';

    if (!crlfOpen && !lfOpen) {
      return { eol: '\n', hasFrontmatter: false, frontmatterLines: [], body: content };
    }

    const openEnd = `---${eol}`.length;
    const closeMarker = `${eol}---`;
    const closeIdx = content.indexOf(closeMarker, openEnd);

    if (closeIdx === -1) {
      return { eol, hasFrontmatter: false, frontmatterLines: [], body: content };
    }

    const frontmatter = content.slice(openEnd, closeIdx);
    const body = content.slice(closeIdx + closeMarker.length);
    return {
      eol,
      hasFrontmatter: true,
      frontmatterLines: frontmatter.length > 0 ? frontmatter.split(eol) : [],
      body,
    };
  }

  private parseFrontmatterFields(frontmatterLines: string[]): Record<string, string | string[]> {
    const fields: Record<string, string | string[]> = {};

    for (const line of frontmatterLines) {
      const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
      if (!match) {
        continue;
      }

      fields[match[1]!] = this.deserializeFrontmatterValue(match[2] || '');
    }

    return fields;
  }

  private async writeFileAtomically(absolutePath: string, content: string): Promise<void> {
    const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, absolutePath);
  }

  /**
   * Normalise a raw YAML title value to a double-quoted scalar.
   * Handles: empty, already double-quoted, single-quoted (unescaping `''`),
   * block-scalar indicators, and plain unquoted values.
   */
  private normalizeFrontmatterTitleValue(value: string): string {
    const trimmed = value.trim();

    if (trimmed === '') {
      return '""';
    }

    // Block scalar indicator — leave as-is to avoid corrupting multi-line titles
    if (this.isYamlBlockScalarIndicator(trimmed)) {
      return value;
    }

    // Already correctly double-quoted
    if (/^"(?:[^"\\]|\\[\s\S])*"$/.test(trimmed)) {
      return trimmed;
    }

    // Single-quoted: unescape '' → ' then re-encode for double-quoted YAML
    if (/^'(?:[^']|'')*'$/.test(trimmed)) {
      const inner = trimmed.slice(1, -1).replace(/''/g, "'");
      return `"${this.escapeForYamlDoubleQuoted(inner)}"`;
    }

    // Plain unquoted value
    return `"${this.escapeForYamlDoubleQuoted(trimmed)}"`;
  }

  /**
   * Ensure every `title:` line in YAML frontmatter is double-quoted.
   * Handles already-quoted (single or double), multi-word, and special-char values.
   * Preserves inline comments and handles both LF and CRLF line endings.
   */
  private quoteFrontmatterTitles(content: string): string {
    // Support both LF and CRLF opening delimiters
    const crlfOpen = content.startsWith('---\r\n');
    const lfOpen = content.startsWith('---\n');
    if (!crlfOpen && !lfOpen) {
      return content;
    }

    const eol = crlfOpen ? '\r\n' : '\n';
    const openEnd = `---${eol}`.length;

    // Find the closing "---" delimiter that follows a newline
    const closeMarker = `${eol}---`;
    const closeIdx = content.indexOf(closeMarker, openEnd);
    if (closeIdx === -1) {
      return content;
    }

    const frontmatter = content.slice(openEnd, closeIdx);
    const rest = content.slice(closeIdx); // includes the eol + "---"

    // Rewrite only the "title:" line — scan line by line, O(n).
    const lines = frontmatter.split(eol);
    const fixedLines = lines.map(line => {
      if (!line.startsWith('title:')) {
        return line;
      }
      const colonIdx = line.indexOf(':');
      const afterColon = line.slice(colonIdx + 1);
      const leadingSpace = afterColon.length - afterColon.trimStart().length;
      const raw = afterColon.trimStart();

      const { valuePart, commentPart } = this.splitYamlInlineComment(raw);
      const normalized = this.normalizeFrontmatterTitleValue(valuePart);
      const prefix = `title:${' '.repeat(Math.max(1, leadingSpace))}`;
      return `${prefix}${normalized}${commentPart}`;
    });

    return `---${eol}${fixedLines.join(eol)}${rest}`;
  }

  async readBeanFile(relativePath: string): Promise<{ path: string; content: string }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    const content = await readFile(absolutePath, 'utf8');
    return { path: absolutePath, content };
  }

  async editBeanFile(relativePath: string, content: string): Promise<{ path: string; bytes: number }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    const fixed = this.quoteFrontmatterTitles(content);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, fixed, 'utf8');
    return { path: absolutePath, bytes: Buffer.byteLength(fixed, 'utf8') };
  }

  async updateBeanFrontmatter(
    relativePath: string,
    updates: {
      title?: string;
      status?: string;
      type?: string;
      priority?: string;
      parent_id?: string | null;
      tags?: string[] | null;
      blocking_ids?: string[] | null;
      blocked_by_ids?: string[] | null;
      pr?: string | null;
      branch?: string | null;
    },
  ): Promise<{
    path: string;
    bytes: number;
    updatedFields: string[];
    frontmatter: Record<string, string | string[]>;
  }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    const content = await readFile(absolutePath, 'utf8');
    const { eol, hasFrontmatter, frontmatterLines, body } = this.splitFrontmatterDocument(content);
    const updatedFields = Object.entries(updates)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    if (updatedFields.length === 0) {
      throw new Error('At least one frontmatter field update is required');
    }

    const nextLines = [...frontmatterLines];
    const indexByKey = new Map<string, number>();

    nextLines.forEach((line, index) => {
      const match = line.match(/^([a-zA-Z0-9_]+):\s*/);
      if (match) {
        indexByKey.set(match[1]!, index);
      }
    });

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        continue;
      }

      const existingIndex = indexByKey.get(key);
      if (value === null) {
        if (existingIndex !== undefined) {
          nextLines.splice(existingIndex, 1);
          indexByKey.clear();
          nextLines.forEach((line, index) => {
            const match = line.match(/^([a-zA-Z0-9_]+):\s*/);
            if (match) {
              indexByKey.set(match[1]!, index);
            }
          });
        }
        continue;
      }

      const serialized = `${key}: ${this.serializeFrontmatterValue(key, value)}`;
      if (existingIndex !== undefined) {
        const existingLine = nextLines[existingIndex] ?? '';
        const existingMatch = existingLine.match(/^[a-zA-Z0-9_]+:\s*(.*)$/);
        const commentPart = existingMatch ? this.splitYamlInlineComment(existingMatch[1] || '').commentPart : '';
        nextLines[existingIndex] = `${serialized}${commentPart}`;
      } else {
        nextLines.push(serialized);
        indexByKey.set(key, nextLines.length - 1);
      }
    }

    const frontmatterBlock = nextLines.length > 0 ? nextLines.join(eol) : '';
    const nextContent = hasFrontmatter
      ? `---${eol}${frontmatterBlock}${eol}---${body}`
      : `---${eol}${frontmatterBlock}${eol}---${eol}${body}`;
    const fixed = this.quoteFrontmatterTitles(nextContent);

    await this.writeFileAtomically(absolutePath, fixed);

    return {
      path: absolutePath,
      bytes: Buffer.byteLength(fixed, 'utf8'),
      updatedFields,
      frontmatter: this.parseFrontmatterFields(this.splitFrontmatterDocument(fixed).frontmatterLines),
    };
  }

  async createBeanFile(
    relativePath: string,
    content: string,
    options?: { overwrite?: boolean },
  ): Promise<{ path: string; bytes: number; created: boolean }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    const fixed = this.quoteFrontmatterTitles(content);
    await mkdir(dirname(absolutePath), { recursive: true });

    try {
      await writeFile(absolutePath, fixed, {
        encoding: 'utf8',
        flag: options?.overwrite ? 'w' : 'wx',
      });
    } catch (error) {
      const maybeNodeError = error as NodeJS.ErrnoException;
      if (maybeNodeError.code === 'EEXIST' && !options?.overwrite) {
        throw new Error('Bean file already exists. Pass overwrite=true to replace it.');
      }
      throw error;
    }

    return {
      path: absolutePath,
      bytes: Buffer.byteLength(fixed, 'utf8'),
      created: true,
    };
  }

  async deleteBeanFile(relativePath: string): Promise<{ path: string; deleted: boolean }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    await rm(absolutePath, { force: false });
    return { path: absolutePath, deleted: true };
  }
}
