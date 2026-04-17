import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
// Log package version on startup to help diagnose runtime package mismatches
// Note: resolveJsonModule is enabled in tsconfig, so we can import package.json safely.
// Always log to stderr to avoid interfering with MCP stdio transport on stdout.
import pkgJson from '../../package.json';
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

const execFileAsync = promisify(execFile);
const PACKAGE_VERSION = (pkgJson as { version?: string }).version ?? '0.0.0-dev';
const CLOSED_STATUSES = new Set(['completed', 'scrapped']);
const BEAN_ID_HINT = 'Missing required field `beanId`. Did you mean `beanId`?';

function getSafeCliEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const whitelist = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SHELL'];
  const safeEnv: NodeJS.ProcessEnv = {};

  for (const key of whitelist) {
    if (env[key]) {
      safeEnv[key] = env[key];
    }
  }

  for (const key in env) {
    if (key.startsWith('BEANS_')) {
      safeEnv[key] = env[key];
    }
  }

  return safeEnv;
}

/**
 * Extract semantic version from arbitrary CLI output (e.g. "beans version v0.4.2").
 */
export function extractVersionFromOutput(output: string): string | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/(?:^|[^\d])v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  return match?.[1] ?? null;
}

/**
 * Best-effort CLI version probe. Returns null when unavailable or unparseable.
 */
export async function detectBeansCliVersion(cliPath: string, workspaceRoot: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(cliPath, ['version'], {
      cwd: workspaceRoot,
      env: getSafeCliEnv(process.env),
      maxBuffer: 1024 * 1024,
      timeout: 5000,
    });

    return extractVersionFromOutput(`${stdout}\n${stderr}`);
  } catch {
    return null;
  }
}

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

function collectDescendantBeans(beans: Array<{ id: string; parentId?: string; status: string }>, rootBeanId: string) {
  const byParent = new Map<string, string[]>();
  const byId = new Map(beans.map(bean => [bean.id, bean]));

  for (const bean of beans) {
    if (!bean.parentId) {
      continue;
    }
    const children = byParent.get(bean.parentId) ?? [];
    children.push(bean.id);
    byParent.set(bean.parentId, children);
  }

  const queue = [...(byParent.get(rootBeanId) ?? [])];
  const visited = new Set<string>();
  const descendants: Array<{ id: string; parentId?: string; status: string }> = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    const currentBean = byId.get(currentId);
    if (!currentBean) {
      continue;
    }

    descendants.push(currentBean);
    const children = byParent.get(currentId);
    if (children && children.length > 0) {
      queue.push(...children);
    }
  }

  return descendants;
}

async function cascadeStatusToDescendants(
  backend: BackendInterface,
  rootBeanId: string,
  targetStatus: string,
  options?: { onlyCurrentStatuses?: Set<string> },
) {
  const beans = await backend.list();
  const descendants = collectDescendantBeans(beans, rootBeanId);
  const updatedBeanIds: string[] = [];
  const skippedBeanIds: string[] = [];
  const errors: Array<{ beanId: string; error: string }> = [];

  for (const bean of descendants) {
    if (options?.onlyCurrentStatuses && !options.onlyCurrentStatuses.has(bean.status)) {
      skippedBeanIds.push(bean.id);
      continue;
    }

    try {
      await backend.update(bean.id, { status: targetStatus });
      updatedBeanIds.push(bean.id);
    } catch (error) {
      errors.push({ beanId: bean.id, error: (error as Error).message });
    }
  }

  return {
    totalDescendants: descendants.length,
    updatedBeanIds,
    skippedBeanIds,
    errors,
  };
}

function completeMarkdownTasks(body: string): { nextBody: string; totalTaskCount: number; updatedTaskCount: number } {
  const lines = body.split(/\r?\n/);
  let totalTaskCount = 0;
  let updatedTaskCount = 0;

  const taskLinePattern = /^\s*(?:[-*+]|\d+\.)\s+\[(?: |x|X)\]/;
  const uncheckedTaskLinePattern = /^(\s*(?:[-*+]|\d+\.)\s+\[)\s(\].*)$/;

  const nextLines = lines.map(line => {
    if (!taskLinePattern.test(line)) {
      return line;
    }

    totalTaskCount += 1;
    const uncheckedMatch = line.match(uncheckedTaskLinePattern);
    if (!uncheckedMatch) {
      return line;
    }

    updatedTaskCount += 1;
    return `${uncheckedMatch[1]}x${uncheckedMatch[2]}`;
  });

  const nextBody = nextLines.join('\n');
  return { nextBody, totalTaskCount, updatedTaskCount };
}

// Exported handler factories so unit tests can call handlers directly.
export function initHandler(backend: BackendInterface) {
  return async ({ prefix }: { prefix?: string }) => {
    const result = await backend.init(prefix);
    return makeTextAndStructured(result);
  };
}

export function archiveHandler(backend: BackendInterface) {
  return async () => {
    if (typeof backend.archive !== 'function') {
      throw new Error('Archive is not supported by the current backend');
    }

    return makeTextAndStructured(await backend.archive());
  };
}

export function viewHandler(backend: BackendInterface) {
  return async ({ beanId, beanIds }: { beanId?: string; beanIds?: string[] }) => {
    const ids = Array.isArray(beanIds) && beanIds.length > 0 ? beanIds : beanId ? [beanId] : [];

    if (ids.length === 0) {
      throw new Error('Either beanId or beanIds must be provided');
    }

    if (ids.length === 1) {
      const bean = await getBeanById(backend, ids[0]!);
      return makeTextAndStructured({ bean });
    }

    const beans = await backend.list();
    const byId = new Map(beans.map(b => [b.id, b]));

    const found = ids.map(id => byId.get(id)).filter(Boolean);
    const missingBeanIds = ids.filter(id => !byId.has(id));

    return makeTextAndStructured({
      beans: found,
      missingBeanIds,
      count: found.length,
      requestedCount: ids.length,
    });
  };
}

async function checkVersionCompatibility(
  cliPath: string,
  workspaceRoot: string,
  detector: (cliPath: string, workspaceRoot: string) => Promise<string | null>,
): Promise<void> {
  const detectedBeansVersion = await detector(cliPath, workspaceRoot);
  if (!detectedBeansVersion) {
    console.error(
      `[beans-mcp] warning: unable to determine Beans CLI version from \`${cliPath}\`; proceeding without version compatibility checks.`,
    );
    return;
  }

  if (detectedBeansVersion !== PACKAGE_VERSION) {
    console.error(
      `[beans-mcp] warning: version mismatch detected (beans=${detectedBeansVersion}, beans-mcp=${PACKAGE_VERSION}); continuing startup.`,
    );
  }
}

export function createHandler(backend: BackendInterface) {
  return async (input: {
    title: string;
    type: string;
    status?: string;
    priority?: string;
    body?: string;
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
    const updatedParentBean = await backend.update(beanId, { status: targetStatus });
    const cascade = await cascadeStatusToDescendants(backend, beanId, targetStatus, {
      onlyCurrentStatuses: CLOSED_STATUSES,
    });

    return makeTextAndStructured({
      bean: updatedParentBean,
      cascade: {
        totalDescendants: cascade.totalDescendants,
        updatedBeanIds: cascade.updatedBeanIds,
        skippedBeanIds: cascade.skippedBeanIds,
        errors: cascade.errors,
      },
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
    bodyAppend?: string;
    bodyReplace?: Array<{ old: string; new: string }>;
    ifMatch?: string;
  }) => {
    const updatedBean = await backend.update(input.beanId, {
      status: input.status,
      type: input.type,
      priority: input.priority,
      parent: input.parent,
      clearParent: input.clearParent,
      blocking: input.blocking,
      blockedBy: input.blockedBy,
      body: input.body,
      bodyAppend: input.bodyAppend,
      bodyReplace: input.bodyReplace,
      ifMatch: input.ifMatch,
    });

    const shouldCascadeClose = Boolean(input.status && CLOSED_STATUSES.has(input.status));
    const cascade = shouldCascadeClose
      ? await cascadeStatusToDescendants(backend, input.beanId, input.status as string)
      : null;

    return makeTextAndStructured({
      bean: updatedBean,
      ...(cascade
        ? {
            cascade: {
              totalDescendants: cascade.totalDescendants,
              updatedBeanIds: cascade.updatedBeanIds,
              skippedBeanIds: cascade.skippedBeanIds,
              errors: cascade.errors,
            },
          }
        : {}),
    });
  };
}

export function completeTasksHandler(backend: BackendInterface) {
  return async ({ beanId }: { beanId: string }) => {
    const bean = await getBeanById(backend, beanId);
    const { nextBody, totalTaskCount, updatedTaskCount } = completeMarkdownTasks(bean.body || '');

    const updatedBean = updatedTaskCount > 0 ? await backend.update(beanId, { body: nextBody }) : bean;

    return makeTextAndStructured({
      bean: updatedBean,
      totalTaskCount,
      updatedTaskCount,
      unchangedTaskCount: totalTaskCount - updatedTaskCount,
    });
  };
}

export function deleteHandler(backend: BackendInterface) {
  return async ({ beanId, beanIds, force }: { beanId?: string; beanIds?: string[]; force: boolean }) => {
    const ids = Array.isArray(beanIds) && beanIds.length > 0 ? beanIds : beanId ? [beanId] : [];
    if (ids.length === 0) {
      throw new Error('Either beanId or beanIds must be provided');
    }

    if (ids.length === 1) {
      const bean = await getBeanById(backend, ids[0]!);
      if (!force && bean.status !== 'draft' && bean.status !== 'scrapped') {
        throw new Error('Only draft and scrapped beans are deletable unless force=true');
      }
      return makeTextAndStructured(await backend.delete(ids[0]!));
    }

    const beans = await backend.list();
    const byId = new Map(beans.map(b => [b.id, b]));
    const results: Array<{ beanId: string; deleted: boolean; error?: string }> = [];

    for (const id of ids) {
      const bean = byId.get(id);
      if (!bean) {
        results.push({ beanId: id, deleted: false, error: 'Bean not found' });
        continue;
      }
      if (!force && bean.status !== 'draft' && bean.status !== 'scrapped') {
        results.push({
          beanId: id,
          deleted: false,
          error: 'Only draft and scrapped beans are deletable unless force=true',
        });
        continue;
      }

      try {
        await backend.delete(id);
        results.push({ beanId: id, deleted: true });
      } catch (error) {
        results.push({
          beanId: id,
          deleted: false,
          error: (error as Error).message,
        });
      }
    }

    return makeTextAndStructured({
      results,
      requestedCount: ids.length,
      deletedCount: results.filter(r => r.deleted).length,
      failedCount: results.filter(r => !r.deleted).length,
    });
  };
}

export function bulkCreateHandler(backend: BackendInterface) {
  return async (input: {
    beans: Array<{
      title: string;
      type: string;
      status?: string;
      priority?: string;
      body?: string;
      description?: string;
      parent?: string;
    }>;
    parent?: string;
  }) => {
    const results = await backend.bulkCreate(input.beans, input.parent);
    return makeTextAndStructured({
      results,
      requestedCount: input.beans.length,
      successCount: results.filter(r => r.bean).length,
      failedCount: results.filter(r => r.error).length,
    });
  };
}

export function bulkUpdateHandler(backend: BackendInterface) {
  return async (input: {
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
    }>;
    parent?: string;
  }) => {
    const results = await backend.bulkUpdate(input.beans, input.parent);
    return makeTextAndStructured({
      results,
      requestedCount: input.beans.length,
      successCount: results.filter(r => r.bean).length,
      failedCount: results.filter(r => r.error).length,
    });
  };
}

export function queryHandler(backend: BackendInterface) {
  return async (opts: {
    operation: 'refresh' | 'filter' | 'search' | 'sort' | 'ready' | 'llm_context' | 'open_config' | 'graphql';
    mode?: 'status-priority-type-title' | 'updated' | 'created' | 'id';
    statuses?: string[] | null;
    types?: string[] | null;
    search?: string;
    includeClosed?: boolean;
    tags?: string[] | null;
    graphql?: string;
    variables?: Record<string, unknown>;
    writeToWorkspaceInstructions?: boolean;
  }) => {
    if (opts.operation === 'graphql') {
      if (typeof backend.queryGraphql !== 'function') {
        throw new Error('GraphQL passthrough is not supported by the current backend');
      }

      const result = await backend.queryGraphql(opts.graphql || '', opts.variables);
      return makeTextAndStructured({ data: result.data, errors: result.errors ?? [] });
    }

    return handleQueryOperation(backend, opts);
  };
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
    'beans_archive',
    {
      title: 'Archive Beans',
      description: 'Archive completed or scrapped beans, equivalent to the beans CLI archive command.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    archiveHandler(backend),
  );

  server.registerTool(
    'beans_view',
    {
      title: 'View Bean',
      description: 'Fetch full bean details by ID.',
      inputSchema: z
        .object({
          beanId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
          beanIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)).optional(),
        })
        .refine(input => Boolean(input.beanId) || (Array.isArray(input.beanIds) && input.beanIds.length > 0), {
          message: `Either beanId or beanIds must be provided. ${BEAN_ID_HINT}`,
        }),
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
        body: z.string().max(MAX_DESCRIPTION_LENGTH).optional().describe('Body markdown content'),
        description: z.string().max(MAX_DESCRIPTION_LENGTH).optional().describe('Deprecated alias for body'),
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
      inputSchema: z
        .object({
          beanId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
          status: z.string().max(MAX_METADATA_LENGTH).optional(),
          type: z.string().max(MAX_METADATA_LENGTH).optional(),
          priority: z.string().max(MAX_METADATA_LENGTH).optional(),
          parent: z.string().max(MAX_ID_LENGTH).optional(),
          clearParent: z.boolean().optional(),
          blocking: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
          blockedBy: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
        })
        .superRefine((input, ctx) => {
          if (!input.beanId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beanId'], message: BEAN_ID_HINT });
          }
        })
        .transform(input => ({ ...input, beanId: input.beanId as string })),
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
      inputSchema: z
        .object({
          beanId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
          requiredCurrentStatus: z.enum(['completed', 'scrapped']),
          targetStatus: z.string().max(MAX_METADATA_LENGTH).default('todo'),
        })
        .superRefine((input, ctx) => {
          if (!input.beanId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beanId'], message: BEAN_ID_HINT });
          }
        })
        .transform(input => ({ ...input, beanId: input.beanId as string })),
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
      inputSchema: z
        .object({
          beanId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
          status: z.string().max(MAX_METADATA_LENGTH).optional(),
          type: z.string().max(MAX_METADATA_LENGTH).optional(),
          priority: z.string().max(MAX_METADATA_LENGTH).optional(),
          parent: z.string().max(MAX_ID_LENGTH).optional(),
          clearParent: z.boolean().optional(),
          blocking: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
          blockedBy: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
          body: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
          bodyAppend: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
          bodyReplace: z
            .array(
              z.object({
                old: z.string().max(MAX_DESCRIPTION_LENGTH),
                new: z.string().max(MAX_DESCRIPTION_LENGTH),
              }),
            )
            .optional(),
          ifMatch: z.string().max(MAX_METADATA_LENGTH).optional(),
        })
        .superRefine((input, ctx) => {
          if (!input.beanId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beanId'], message: BEAN_ID_HINT });
          }
        })
        .refine(
          input => !(input.body !== undefined && (input.bodyAppend !== undefined || input.bodyReplace !== undefined)),
          {
            message: 'body cannot be combined with bodyAppend/bodyReplace',
          },
        )
        .transform(input => ({ ...input, beanId: input.beanId as string })),
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
      inputSchema: z
        .object({
          beanId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
          beanIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)).optional(),
          force: z.boolean().default(false),
        })
        .refine(input => Boolean(input.beanId) || (Array.isArray(input.beanIds) && input.beanIds.length > 0), {
          message: `Either beanId or beanIds must be provided. ${BEAN_ID_HINT}`,
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

  const beanCreateItemSchema = z.object({
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    type: z.string().min(1).max(MAX_METADATA_LENGTH),
    status: z.string().max(MAX_METADATA_LENGTH).optional(),
    priority: z.string().max(MAX_METADATA_LENGTH).optional(),
    body: z.string().max(MAX_DESCRIPTION_LENGTH).optional().describe('Body markdown content'),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional().describe('Deprecated alias for body'),
    parent: z.string().max(MAX_ID_LENGTH).optional().describe('Override the top-level parent for this item'),
  });

  server.registerTool(
    'beans_bulk_create',
    {
      title: 'Bulk Create Beans',
      description: 'Create multiple beans in one call. Optionally assign all of them (or a subset) to a shared parent.',
      inputSchema: z.object({
        beans: z.array(beanCreateItemSchema).min(1),
        parent: z
          .string()
          .max(MAX_ID_LENGTH)
          .optional()
          .describe('Default parent ID applied to any bean that does not specify its own parent'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    bulkCreateHandler(backend),
  );

  const beanUpdateItemSchema = z
    .object({
      beanId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
      status: z.string().max(MAX_METADATA_LENGTH).optional(),
      type: z.string().max(MAX_METADATA_LENGTH).optional(),
      priority: z.string().max(MAX_METADATA_LENGTH).optional(),
      parent: z.string().max(MAX_ID_LENGTH).optional().describe('Override the top-level parent for this item'),
      clearParent: z.boolean().optional(),
      blocking: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
      blockedBy: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
      body: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
      bodyAppend: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
      bodyReplace: z
        .array(z.object({ old: z.string().max(MAX_DESCRIPTION_LENGTH), new: z.string().max(MAX_DESCRIPTION_LENGTH) }))
        .optional(),
      ifMatch: z.string().max(MAX_METADATA_LENGTH).optional(),
    })
    .superRefine((input, ctx) => {
      if (!input.beanId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beanId'], message: BEAN_ID_HINT });
      }
    })
    .refine(
      input => !(input.body !== undefined && (input.bodyAppend !== undefined || input.bodyReplace !== undefined)),
      { message: 'body cannot be combined with bodyAppend/bodyReplace' },
    )
    .transform(input => ({ ...input, beanId: input.beanId as string }));

  server.registerTool(
    'beans_bulk_update',
    {
      title: 'Bulk Update Beans',
      description: 'Update multiple beans in one call. Optionally assign all of them (or a subset) to a shared parent.',
      inputSchema: z.object({
        beans: z.array(beanUpdateItemSchema).min(1),
        parent: z
          .string()
          .max(MAX_ID_LENGTH)
          .optional()
          .describe('Default parent ID applied to any bean that does not specify its own parent'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    bulkUpdateHandler(backend),
  );

  server.registerTool(
    'beans_complete_tasks',
    {
      title: 'Complete Markdown Tasks',
      description: 'Mark all markdown checklist tasks within a bean as completed.',
      inputSchema: z
        .object({
          beanId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
        })
        .superRefine((input, ctx) => {
          if (!input.beanId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beanId'], message: BEAN_ID_HINT });
          }
        })
        .transform(input => ({ ...input, beanId: input.beanId as string })),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    completeTasksHandler(backend),
  );

  server.registerTool(
    'beans_query',
    {
      title: 'Query Beans',
      description: 'Unified query tool for refresh, filter, search, and sort operations.',
      inputSchema: z
        .object({
          operation: z
            .enum(['refresh', 'filter', 'search', 'sort', 'ready', 'llm_context', 'open_config', 'graphql'])
            .default('refresh'),
          mode: z.enum(['status-priority-type-title', 'updated', 'created', 'id']).optional(),
          statuses: z.array(z.string().max(MAX_METADATA_LENGTH)).nullable().optional(),
          types: z.array(z.string().max(MAX_METADATA_LENGTH)).nullable().optional(),
          search: z.string().max(MAX_TITLE_LENGTH).optional(),
          includeClosed: z.boolean().optional(),
          tags: z.array(z.string().max(MAX_METADATA_LENGTH)).nullable().optional(),
          graphql: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
          variables: z.record(z.string(), z.unknown()).optional(),
          writeToWorkspaceInstructions: z.boolean().optional(),
        })
        .superRefine((input, ctx) => {
          if (input.operation === 'graphql' && (!input.graphql || input.graphql.trim().length === 0)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['graphql'],
              message: 'graphql query string is required when operation is graphql',
            });
          }
        }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
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
  archive() {
    return this.inner.archive?.() ?? Promise.resolve({ archived: false, reason: 'Archive not supported by backend' });
  }
  queryGraphql(query: string, variables?: Record<string, unknown>) {
    if (typeof this.inner.queryGraphql === 'function') {
      return this.inner.queryGraphql(query, variables);
    }
    return Promise.reject(new Error('GraphQL passthrough is not supported by backend'));
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
  bulkCreate(beans: Parameters<BackendInterface['bulkCreate']>[0], defaultParent?: string) {
    return this.inner.bulkCreate(beans, defaultParent);
  }
  bulkUpdate(beans: Parameters<BackendInterface['bulkUpdate']>[0], defaultParent?: string) {
    return this.inner.bulkUpdate(beans, defaultParent);
  }
  openConfig() {
    return this.inner.openConfig();
  }
  primeInstructions() {
    return this.inner.primeInstructions?.() ?? Promise.resolve('');
  }
  writeInstructions(instructions: string) {
    return this.inner.writeInstructions?.(instructions) ?? Promise.resolve(null);
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
    version: opts.version || PACKAGE_VERSION,
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
  /** For testing only: override Beans CLI version detection. */
  _detectBeansVersion?: (cliPath: string, workspaceRoot: string) => Promise<string | null>,
): Promise<void> {
  const { BeansCliBackend } = await import('./backend');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const { workspaceRoot, workspaceExplicit, cliPath, port, logDir } = parseCliArgs(argv);
  let effectiveWorkspaceRoot = workspaceRoot;
  process.env.BEANS_VSCODE_MCP_PORT = String(port);
  process.env.BEANS_MCP_PORT = String(port);

  // Emit a single-line startup banner with package version and key settings.
  try {
    const workspaceLabel = workspaceExplicit ? workspaceRoot : '(auto from roots)';
    // stderr only – stdout is reserved for JSON-RPC traffic
    console.error(
      `[beans-mcp] v${PACKAGE_VERSION} starting (port=${port}, workspace=${workspaceLabel}, cli=${cliPath}, logDir=${logDir})`,
    );
  } catch {
    // Best-effort only; never fail startup on logging
  }

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
      mutable.setInner(new BeansCliBackend(rootPath, cliPath, logDir));
      effectiveWorkspaceRoot = rootPath;
      // Log the resolved workspace for traceability (stderr to avoid stdout noise)
      try {
        console.error(`[beans-mcp] workspace resolved from roots: ${rootPath}`);
      } catch {}
    }
  }

  // Non-blocking compatibility warning: do not delay startup while probing CLI version.
  const beansVersionDetector = _detectBeansVersion ?? detectBeansCliVersion;
  void checkVersionCompatibility(cliPath, effectiveWorkspaceRoot, beansVersionDetector).catch(() => {
    // Best-effort logging only; never fail startup.
  });
}
