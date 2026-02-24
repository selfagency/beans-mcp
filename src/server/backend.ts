import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import * as graphql from '../internal/graphql';
import { BeanRecord, GraphQLError } from '../types';
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
    }
  ): Promise<BeanRecord>;
  delete(beanId: string): Promise<Record<string, unknown>>;
  openConfig(): Promise<{ configPath: string; content: string }>;
  graphqlSchema(): Promise<string>;
  readOutputLog(options?: { lines?: number }): Promise<{ path: string; content: string; linesReturned: number }>;
  readBeanFile(relativePath: string): Promise<{ path: string; content: string }>;
  editBeanFile(relativePath: string, content: string): Promise<{ path: string; bytes: number }>;
  createBeanFile(
    relativePath: string,
    content: string,
    options?: { overwrite?: boolean }
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
    private readonly logDir?: string
  ) {}

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
    const cleaned = relativePath.trim().replace(/^\/+/, '');
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
    variables?: Record<string, unknown>
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
        `Failed to parse Beans CLI GraphQL output: ${(error as Error).message}\nOutput: ${stdout.slice(0, 1000)}`
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
    const filter: Record<string, any> = {};

    if (options?.status && options.status.length > 0) {
      filter.status = options.status;
    }

    if (options?.type && options.type.length > 0) {
      filter.type = options.type;
    }

    if (options?.search) {
      filter.search = options.search;
    }

    const { data, errors } = await this.executeGraphQL<{ beans: BeanRecord[] }>(graphql.LIST_BEANS_QUERY, { filter });

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

    return data.beans;
  }

  async create(input: {
    title: string;
    type: string;
    status?: string;
    priority?: string;
    description?: string;
    parent?: string;
  }): Promise<BeanRecord> {
    const createInput: Record<string, unknown> = {
      title: input.title,
      type: input.type,
      status: input.status,
      priority: input.priority,
      body: input.description,
      parent: input.parent,
    };

    const { data, errors } = await this.executeGraphQL<{ createBean: BeanRecord }>(
      graphql.CREATE_BEAN_MUTATION,
      {
        input: createInput,
      }
    );

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

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
    }
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

    const { data, errors } = await this.executeGraphQL<{ updateBean: BeanRecord }>(
      graphql.UPDATE_BEAN_MUTATION,
      {
        id: beanId,
        input: updateInput,
      }
    );

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

    return data.updateBean;
  }

  async delete(beanId: string): Promise<Record<string, unknown>> {
    const { errors } = await this.executeGraphQL<{ deleteBean: boolean }>(graphql.DELETE_BEAN_MUTATION, {
      id: beanId,
    });

    if (errors && errors.length > 0) {
      throw new Error(`GraphQL error: ${errors.map(e => e.message).join(', ')}`);
    }

    return { deleted: true, beanId };
  }

  async openConfig(): Promise<{ configPath: string; content: string }> {
    const configPath = join(this.workspaceRoot, '.beans.yml');
    const content = await readFile(configPath, 'utf8');
    return { configPath, content };
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
      process.env.BEANS_VSCODE_OUTPUT_LOG || join(this.workspaceRoot, '.vscode', 'logs', 'beans-output.log')
    );

    const isWithinWorkspace = isPathWithinRoot(this.workspaceRoot, outputPath);
    const vscodeLogDir = process.env.BEANS_VSCODE_LOG_DIR || this.logDir ? resolve(process.env.BEANS_VSCODE_LOG_DIR || this.logDir || '') : undefined;
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

  async readBeanFile(relativePath: string): Promise<{ path: string; content: string }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    const content = await readFile(absolutePath, 'utf8');
    return { path: absolutePath, content };
  }

  async editBeanFile(relativePath: string, content: string): Promise<{ path: string; bytes: number }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
    return { path: absolutePath, bytes: Buffer.byteLength(content, 'utf8') };
  }

  async createBeanFile(
    relativePath: string,
    content: string,
    options?: { overwrite?: boolean }
  ): Promise<{ path: string; bytes: number; created: boolean }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });

    await writeFile(absolutePath, content, {
      encoding: 'utf8',
      flag: options?.overwrite ? 'w' : 'wx',
    });

    return {
      path: absolutePath,
      bytes: Buffer.byteLength(content, 'utf8'),
      created: true,
    };
  }

  async deleteBeanFile(relativePath: string): Promise<{ path: string; deleted: boolean }> {
    const absolutePath = this.resolveBeanFilePath(relativePath);
    await rm(absolutePath, { force: false });
    return { path: absolutePath, deleted: true };
  }
}
