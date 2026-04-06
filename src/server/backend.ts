import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

  /** Full records keyed by bean ID, grouped by serialised filter key. */
  private readonly _cache = new Map<string, Map<string, BeanRecord>>();
  /** Last time a particular filter key was fetched (ms). */
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
    // Strip leading slashes, then strip a leading .beans/ or .beans prefix
    // so agents that accidentally include it still resolve correctly.
    const cleaned = relativePath
      .trim()
      .replace(/^\/+/, '')
      .replace(/^\.beans[\\/]?/, '');
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
    const results: Array<{ bean?: BeanRecord; error?: string }> = [];
    for (const item of beans) {
      try {
        const bean = await this.create({
          ...item,
          parent: item.parent ?? defaultParent,
        });
        results.push({ bean });
      } catch (error) {
        results.push({ error: (error as Error).message });
      }
    }
    return results;
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
    const results: Array<{ beanId: string; bean?: BeanRecord; error?: string }> = [];
    for (const { beanId, ...updates } of beans) {
      try {
        const resolvedParent = updates.parent ?? (updates.clearParent ? undefined : defaultParent);
        const bean = await this.update(beanId, { ...updates, parent: resolvedParent });
        results.push({ beanId, bean });
      } catch (error) {
        results.push({ beanId, error: (error as Error).message });
      }
    }
    return results;
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

    const isWithinWorkspace = isPathWithinRoot(this.workspaceRoot, outputPath);
    const vscodeLogDir =
      process.env.BEANS_VSCODE_LOG_DIR || this.logDir
        ? resolve(process.env.BEANS_VSCODE_LOG_DIR || this.logDir || '')
        : undefined;
    const isWithinVscodeLogDir = vscodeLogDir ? isPathWithinRoot(vscodeLogDir, outputPath) : false;

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
   * Ensure every `title:` line in YAML frontmatter is double-quoted.
   * Handles already-quoted (single or double), multi-word, and special-char values.
   *
   * Uses plain string splitting instead of backtracking regexes to guarantee
   * linear-time processing and eliminate any ReDoS attack surface.
   */
  private quoteFrontmatterTitles(content: string): string {
    // Frontmatter must start at the very first line with "---"
    if (!content.startsWith('---\n')) {
      return content;
    }

    // Find the closing "---" delimiter.  indexOf is O(n) with no backtracking.
    const openEnd = 4; // length of "---\n"
    const closeMarker = '\n---';
    const closeIdx = content.indexOf(closeMarker, openEnd);
    if (closeIdx === -1) {
      return content;
    }

    const frontmatter = content.slice(openEnd, closeIdx);
    const rest = content.slice(closeIdx); // includes the "\n---"

    // Rewrite only the "title:" line — scan line by line, O(n).
    const lines = frontmatter.split('\n');
    const fixedLines = lines.map(line => {
      // Match "title:" with optional spaces — no regex quantifier backtracking.
      if (!line.startsWith('title:')) {
        return line;
      }
      const colonIdx = line.indexOf(':');
      const raw = line.slice(colonIdx + 1).trimStart();

      // Already double-quoted: check first and last char only — O(1).
      if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') {
        return line;
      }
      // Already single-quoted: normalise to double quotes.
      // In YAML single-quoted strings '' is the only escape (literal single quote).
      // Backslash is NOT special, so it must be escaped when moving to double-quoted style.
      if (raw.length >= 2 && raw[0] === "'" && raw[raw.length - 1] === "'") {
        const inner = raw
          .slice(1, -1)
          .replaceAll("''", "'") // unescape YAML single-quote escape sequences
          .replaceAll('\\', '\\\\') // escape backslashes for double-quoted YAML
          .replaceAll('"', '\\"'); // escape double-quotes for double-quoted YAML
        return `title: "${inner}"`;
      }
      // Unquoted: escape backslashes first, then double-quotes, then wrap.
      const escaped = raw.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      return `title: "${escaped}"`;
    });

    return `---\n${fixedLines.join('\n')}${rest}`;
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

  async createBeanFile(
    relativePath: string,
    content: string,
    options?: { overwrite?: boolean },
  ): Promise<{ path: string; bytes: number; created: boolean }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    const fixed = this.quoteFrontmatterTitles(content);
    await mkdir(dirname(absolutePath), { recursive: true });

    await writeFile(absolutePath, fixed, {
      encoding: 'utf8',
      flag: options?.overwrite ? 'w' : 'wx',
    });

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
