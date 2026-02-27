import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { handleQueryOperation, sortBeans } from '../internal/queryHelpers';
import {
  DEFAULT_MCP_PORT,
  MAX_DESCRIPTION_LENGTH,
  MAX_ID_LENGTH,
  MAX_METADATA_LENGTH,
  MAX_PATH_LENGTH,
  MAX_TITLE_LENGTH,
} from '../types';
import { makeTextAndStructured } from '../utils';
import type { BackendInterface } from './backend';

export { sortBeans };

// Exported test seam: get a bean by id with consistent error messages
export async function getBeanById(backend: BackendInterface, beanId: string) {
  try {
    const beans = await backend.list();
    const found = beans.find(b => b.id === beanId);
    if (!found) {
      throw new Error(`Bean not found: ${beanId}`);
    }
    return found;
  } catch (error) {
    throw new Error(`Failed to fetch bean ${beanId}: ${(error as Error).message}`);
  }
}

// Exported handler factories so unit tests can call handlers directly.
export function initHandler(backend: BackendInterface) {
  return async ({ prefix }: { prefix?: string }) => {
    const result = await backend.init(prefix);
    return makeTextAndStructured(result);
  };
}

export function viewHandler(backend: BackendInterface) {
  return async ({ beanId }: { beanId: string }) => makeTextAndStructured({ bean: await getBeanById(backend, beanId) });
}

export function createHandler(backend: BackendInterface) {
  return async (input: {
    title: string;
    type: string;
    status?: string;
    priority?: string;
    description?: string;
    parent?: string;
  }) => makeTextAndStructured({ bean: await backend.create(input) });
}

export function editHandler(backend: BackendInterface) {
  return async ({
    beanId,
    ...updates
  }: {
    beanId: string;
    status?: string;
    type?: string;
    priority?: string;
    parent?: string;
    clearParent?: boolean;
    blocking?: string[];
    blockedBy?: string[];
  }) => makeTextAndStructured({ bean: await backend.update(beanId, updates) });
}

export function reopenHandler(backend: BackendInterface) {
  return async ({
    beanId,
    requiredCurrentStatus,
    targetStatus,
  }: {
    beanId: string;
    requiredCurrentStatus: 'completed' | 'scrapped';
    targetStatus: string;
  }) => {
    const bean = await getBeanById(backend, beanId);
    if (bean.status !== requiredCurrentStatus) {
      throw new Error(`Bean ${beanId} is not ${requiredCurrentStatus}`);
    }
    return makeTextAndStructured({
      bean: await backend.update(beanId, { status: targetStatus }),
    });
  };
}

export function updateHandler(backend: BackendInterface) {
  return async (input: {
    beanId: string;
    status?: string;
    type?: string;
    priority?: string;
    parent?: string;
    clearParent?: boolean;
    blocking?: string[];
    blockedBy?: string[];
    body?: string;
  }) =>
    makeTextAndStructured({
      bean: await backend.update(input.beanId, {
        status: input.status,
        type: input.type,
        priority: input.priority,
        parent: input.parent,
        clearParent: input.clearParent,
        blocking: input.blocking,
        blockedBy: input.blockedBy,
        body: input.body,
      }),
    });
}

export function deleteHandler(backend: BackendInterface) {
  return async ({ beanId, force }: { beanId: string; force: boolean }) => {
    const bean = await getBeanById(backend, beanId);
    if (!force && bean.status !== 'draft' && bean.status !== 'scrapped') {
      throw new Error('Only draft and scrapped beans are deletable unless force=true');
    }
    return makeTextAndStructured(await backend.delete(beanId));
  };
}

export function queryHandler(backend: BackendInterface) {
  return async (opts: {
    operation: 'refresh' | 'filter' | 'search' | 'sort' | 'llm_context' | 'open_config';
    mode?: 'status-priority-type-title' | 'updated' | 'created' | 'id';
    statuses?: string[] | null;
    types?: string[] | null;
    search?: string;
    includeClosed?: boolean;
    tags?: string[] | null;
    writeToWorkspaceInstructions?: boolean;
  }) => handleQueryOperation(backend, opts);
}

export function beanFileHandler(backend: BackendInterface) {
  return async ({
    operation,
    path,
    content,
    overwrite,
  }: {
    operation: 'read' | 'edit' | 'create' | 'delete';
    path: string;
    content?: string;
    overwrite?: boolean;
  }) => {
    if (operation === 'read') {
      return makeTextAndStructured(await backend.readBeanFile(path));
    }
    if (operation === 'edit') {
      return makeTextAndStructured(await backend.editBeanFile(path, content || ''));
    }
    if (operation === 'create') {
      return makeTextAndStructured(await backend.createBeanFile(path, content || '', { overwrite }));
    }
    if (operation === 'delete') {
      return makeTextAndStructured(await backend.deleteBeanFile(path));
    }
    throw new Error('Unsupported operation');
  };
}

export function outputHandler(backend: BackendInterface) {
  return async ({ operation, lines }: { operation: 'read' | 'show'; lines?: number }) => {
    if (operation === 'read') {
      return makeTextAndStructured(await backend.readOutputLog({ lines }));
    }
    return makeTextAndStructured({
      message:
        'When using VS Code UI, run command `Beans: Show Output` to open extension logs. In MCP mode, rely on tool error outputs and host logs.',
    });
  };
}
function registerTools(server: McpServer, backend: BackendInterface): void {
  // register exported handlers bound to this backend

  server.registerTool(
    'beans_init',
    {
      title: 'Initialize Beans Workspace',
      description: 'Initialize Beans in the current workspace, equivalent to the extension init command.',
      inputSchema: z.object({
        prefix: z.string().max(32).optional().describe('Optional workspace prefix for bean IDs'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    initHandler(backend),
  );

  server.registerTool(
    'beans_view',
    {
      title: 'View Bean',
      description: 'Fetch full bean details by ID.',
      inputSchema: z.object({ beanId: z.string().min(1).max(MAX_ID_LENGTH) }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    viewHandler(backend),
  );

  server.registerTool(
    'beans_create',
    {
      title: 'Create Bean',
      description: 'Create a new bean.',
      inputSchema: z.object({
        title: z.string().min(1).max(MAX_TITLE_LENGTH),
        type: z.string().min(1).max(MAX_METADATA_LENGTH),
        status: z.string().max(MAX_METADATA_LENGTH).optional(),
        priority: z.string().max(MAX_METADATA_LENGTH).optional(),
        description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
        parent: z.string().max(MAX_ID_LENGTH).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    createHandler(backend),
  );

  server.registerTool(
    'beans_edit',
    {
      title: 'Edit Bean Metadata',
      description: 'Update bean metadata fields (status/type/priority/parent/blocking).',
      inputSchema: z.object({
        beanId: z.string().min(1).max(MAX_ID_LENGTH),
        status: z.string().max(MAX_METADATA_LENGTH).optional(),
        type: z.string().max(MAX_METADATA_LENGTH).optional(),
        priority: z.string().max(MAX_METADATA_LENGTH).optional(),
        parent: z.string().max(MAX_ID_LENGTH).optional(),
        clearParent: z.boolean().optional(),
        blocking: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
        blockedBy: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    editHandler(backend),
  );

  server.registerTool(
    'beans_reopen',
    {
      title: 'Reopen Bean',
      description: 'Reopen a completed or scrapped bean into a non-closed status.',
      inputSchema: z.object({
        beanId: z.string().min(1).max(MAX_ID_LENGTH),
        requiredCurrentStatus: z.enum(['completed', 'scrapped']),
        targetStatus: z.string().max(MAX_METADATA_LENGTH).default('todo'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    reopenHandler(backend),
  );

  server.registerTool(
    'beans_update',
    {
      title: 'Update Bean',
      description:
        'Update bean metadata fields (status/type/priority/parent/blocking). Consolidated replacement for per-field update tools.',
      inputSchema: z.object({
        beanId: z.string().min(1).max(MAX_ID_LENGTH),
        status: z.string().max(MAX_METADATA_LENGTH).optional(),
        type: z.string().max(MAX_METADATA_LENGTH).optional(),
        priority: z.string().max(MAX_METADATA_LENGTH).optional(),
        parent: z.string().max(MAX_ID_LENGTH).optional(),
        clearParent: z.boolean().optional(),
        blocking: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
        blockedBy: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
        body: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    updateHandler(backend),
  );

  server.registerTool(
    'beans_delete',
    {
      title: 'Delete Bean',
      description: 'Delete a bean (intended for draft/scrapped beans).',
      inputSchema: z.object({
        beanId: z.string().min(1).max(MAX_ID_LENGTH),
        force: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    deleteHandler(backend),
  );

  server.registerTool(
    'beans_query',
    {
      title: 'Query Beans',
      description: 'Unified query tool for refresh, filter, search, and sort operations.',
      inputSchema: z.object({
        operation: z.enum(['refresh', 'filter', 'search', 'sort', 'llm_context', 'open_config']).default('refresh'),
        mode: z.enum(['status-priority-type-title', 'updated', 'created', 'id']).optional(),
        statuses: z.array(z.string().max(MAX_METADATA_LENGTH)).nullable().optional(),
        types: z.array(z.string().max(MAX_METADATA_LENGTH)).nullable().optional(),
        search: z.string().max(MAX_TITLE_LENGTH).optional(),
        includeClosed: z.boolean().optional(),
        tags: z.array(z.string().max(MAX_METADATA_LENGTH)).nullable().optional(),
        writeToWorkspaceInstructions: z.boolean().optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    queryHandler(backend),
  );

  server.registerTool(
    'beans_bean_file',
    {
      title: 'Bean File Operations',
      description: 'Read, create, edit, or delete files under .beans (operation param).',
      inputSchema: z.object({
        operation: z.enum(['read', 'edit', 'create', 'delete']),
        path: z.string().min(1).max(MAX_PATH_LENGTH),
        content: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
        overwrite: z.boolean().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    beanFileHandler(backend),
  );

  server.registerTool(
    'beans_output',
    {
      title: 'Beans Output Tools',
      description: 'Read extension output log or show guidance (operation param).',
      inputSchema: z.object({
        operation: z.enum(['read', 'show']).default('read'),
        lines: z.number().int().min(1).max(5000).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    outputHandler(backend),
  );
}

/**
 * Thin delegation wrapper whose inner backend can be hot-swapped without
 * re-registering tools. Used by startBeansMcpServer to update the workspace
 * after MCP roots are discovered from the connected client.
 */
export class MutableBackend implements BackendInterface {
  constructor(private inner: BackendInterface) {}

  setInner(b: BackendInterface) {
    this.inner = b;
  }

  init(prefix?: string) {
    return this.inner.init(prefix);
  }
  list(opts?: Parameters<BackendInterface['list']>[0]) {
    return this.inner.list(opts);
  }
  create(input: Parameters<BackendInterface['create']>[0]) {
    return this.inner.create(input);
  }
  update(id: string, updates: Parameters<BackendInterface['update']>[1]) {
    return this.inner.update(id, updates);
  }
  delete(id: string) {
    return this.inner.delete(id);
  }
  openConfig() {
    return this.inner.openConfig();
  }
  graphqlSchema() {
    return this.inner.graphqlSchema();
  }
  readOutputLog(opts?: Parameters<BackendInterface['readOutputLog']>[0]) {
    return this.inner.readOutputLog(opts);
  }
  readBeanFile(path: string) {
    return this.inner.readBeanFile(path);
  }
  editBeanFile(path: string, content: string) {
    return this.inner.editBeanFile(path, content);
  }
  createBeanFile(path: string, content: string, opts?: Parameters<BackendInterface['createBeanFile']>[2]) {
    return this.inner.createBeanFile(path, content, opts);
  }
  deleteBeanFile(path: string) {
    return this.inner.deleteBeanFile(path);
  }
}

/**
 * Ask the connected client for its MCP roots and return the first local
 * filesystem path, or null if the client declares no roots or does not
 * support the roots capability.
 */
export async function resolveWorkspaceFromRoots(server: McpServer): Promise<string | null> {
  try {
    const { roots } = await server.server.listRoots();
    for (const root of roots) {
      if (root.uri.startsWith('file://')) {
        return new URL(root.uri).pathname;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function createBeansMcpServer(opts: {
  workspaceRoot: string;
  cliPath?: string;
  name?: string;
  version?: string;
  logDir?: string;
  backend?: BackendInterface;
}): Promise<{ server: McpServer; backend: BackendInterface }> {
  const { BeansCliBackend } = await import('./backend');

  const backend = opts.backend || new BeansCliBackend(opts.workspaceRoot, opts.cliPath || 'beans', opts.logDir);

  const server = new McpServer({
    name: opts.name || 'beans-mcp-server',
    version: opts.version || '0.1.0',
  });

  registerTools(server, backend);

  return { server, backend };
}

const HELP_TEXT = `Usage: beans-mcp-server [workspace-root] [options]

Arguments:
  workspace-root         Path to workspace root.
                         Optional: if omitted, the server first asks the
                         connected MCP client for its declared roots and
                         falls back to the current directory.

Options:
  --workspace <path>     Alias for workspace-root positional argument
  --workspace-root <p>   Alias for workspace-root positional argument
  --cli-path <path>      Path to the beans CLI executable (default: beans)
  --port <number>        MCP server port (default: ${DEFAULT_MCP_PORT})
  --log-dir <path>       Directory for log output (default: workspace root)
  -h, --help             Show this help message

Workspace resolution order (highest to lowest priority):
  1. --workspace-root CLI argument (or positional)
  2. MCP roots declared by the connected client
  3. Current working directory

Environment variables:
  BEANS_MCP_PORT         Override the default MCP port
  BEANS_VSCODE_MCP_PORT  Override the default MCP port (VS Code extension)
`;

export function parseCliArgs(argv: string[]): {
  workspaceRoot: string;
  /** True when the caller explicitly supplied --workspace-root (or the positional arg). */
  workspaceExplicit: boolean;
  cliPath: string;
  port: number;
  logDir?: string;
} {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  let workspaceRoot = process.cwd();
  let workspaceExplicit = false;
  let cliPath = 'beans';
  const envPort = Number.parseInt(process.env.BEANS_VSCODE_MCP_PORT || process.env.BEANS_MCP_PORT || '', 10);
  let port = Number.isInteger(envPort) && envPort > 0 ? envPort : DEFAULT_MCP_PORT;
  let logDir: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--workspace' || arg === '--workspace-root') && argv[i + 1]) {
      workspaceRoot = argv[i + 1]!;
      workspaceExplicit = true;
      i += 1;
    } else if (arg === '--cli-path' && argv[i + 1]) {
      cliPath = argv[i + 1]!;
      if (/[\s;&|><$(){}[\]`]/.test(cliPath)) {
        throw new Error('Invalid CLI path');
      }
      i += 1;
    } else if (arg === '--port' && argv[i + 1]) {
      const parsedPort = Number.parseInt(argv[i + 1]!, 10);
      if (Number.isInteger(parsedPort) && parsedPort > 0) {
        port = parsedPort;
      }
      i += 1;
    } else if (arg === '--log-dir' && argv[i + 1]) {
      logDir = argv[i + 1]!;
      i += 1;
    } else if (!arg.startsWith('-') && i === 0) {
      // positional workspace root
      workspaceRoot = arg;
      workspaceExplicit = true;
    }
  }

  // default logDir to the workspace root when not provided
  if (!logDir) {
    logDir = workspaceRoot;
  }

  return { workspaceRoot, workspaceExplicit, cliPath, port, logDir };
}

export async function startBeansMcpServer(
  argv: string[],
  /** For testing only: override the roots resolver so tests can cover the setInner branch. */
  _resolveRoots?: (server: McpServer) => Promise<string | null>,
): Promise<void> {
  const { BeansCliBackend } = await import('./backend');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const { workspaceRoot, workspaceExplicit, cliPath, port, logDir } = parseCliArgs(argv);
  process.env.BEANS_VSCODE_MCP_PORT = String(port);
  process.env.BEANS_MCP_PORT = String(port);

  // Use a mutable delegate so we can hot-swap the workspace after roots discovery
  // without re-registering the MCP tools.
  const mutable = new MutableBackend(new BeansCliBackend(workspaceRoot, cliPath, logDir));

  const { server } = await createBeansMcpServer({
    workspaceRoot,
    cliPath,
    logDir,
    backend: mutable,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // If the caller did not supply an explicit workspace, ask the connected client
  // for its declared MCP roots and use the first local filesystem path.
  if (!workspaceExplicit) {
    const resolver = _resolveRoots ?? resolveWorkspaceFromRoots;
    const rootPath = await resolver(server);
    if (rootPath) {
      mutable.setInner(new BeansCliBackend(rootPath, cliPath));
    }
  }
}
