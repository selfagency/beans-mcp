/**
 * Protocol-level E2E tests for the MCP server.
 *
 * These tests spin up a real McpServer connected to a real MCP Client via
 * InMemoryTransport. Unlike the unit tests, which call backend methods or
 * handler functions directly, these tests exercise the full stack:
 *
 *   Client → MCP JSON-RPC → Zod input validation → handler → backend mock
 *            → MCP JSON-RPC response → Client
 *
 * This ensures:
 *  - All tools are registered with the correct names and schemas
 *  - Zod validation rejects invalid inputs before they reach the backend
 *  - Responses conform to the MCP wire format (content array + isError flag)
 *  - Tool handler errors surface as { isError: true } tool results
 *  - Zod schema violations also surface as { isError: true } tool results
 *    (the MCP SDK wraps -32602 validation errors as tool-level errors)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { createBeansMcpServer } from '../server/BeansMcpServer';
import type { BackendInterface } from '../server/backend';
import type { BeanRecord } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BEAN: BeanRecord = {
  id: 'bean-1',
  slug: 'bean-1',
  path: 'bean-1.md',
  title: 'Fix the thing',
  body: '## Details\n\nSome content.',
  status: 'todo',
  type: 'task',
  priority: 'normal',
  tags: ['backend'],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
};

function makeBackend(overrides: Partial<BackendInterface> = {}): BackendInterface {
  return {
    init: vi.fn(async () => ({ initialized: true })),
    archive: vi.fn(async () => ({ archived: true, archivedCount: 1 })),
    queryGraphql: vi.fn(async () => ({ data: { beans: [{ id: BEAN.id }] }, errors: [] })),
    list: vi.fn(async () => [BEAN]),
    create: vi.fn(async input => ({ ...BEAN, id: 'new-bean', title: input.title, type: input.type })),
    update: vi.fn(async (id, updates) => ({ ...BEAN, id, ...updates })),
    delete: vi.fn(async () => ({ deleted: true, beanId: BEAN.id })),
    openConfig: vi.fn(async () => ({ configPath: '/ws/.beans.yml', content: 'prefix: proj' })),
    primeInstructions: vi.fn(async () => 'PRIME-OUTPUT'),
    writeInstructions: vi.fn(async () => '/ws/.github/instructions/beans-prime.instructions.md'),
    graphqlSchema: vi.fn(async () => 'type Query { beans: [Bean] }'),
    readOutputLog: vi.fn(async () => ({ path: '/log.txt', content: 'line1\nline2', linesReturned: 2 })),
    readBeanFile: vi.fn(async path => ({ path, content: '---\ntitle: Test\n---\n' })),
    editBeanFile: vi.fn(async (path, content) => ({ path, bytes: Buffer.byteLength(content, 'utf8') })),
    updateBeanFrontmatter: vi.fn(async (path, updates) => ({
      path,
      bytes: 42,
      updatedFields: Object.keys(updates),
      frontmatter: updates,
    })),
    createBeanFile: vi.fn(async (path, content) => ({
      path,
      bytes: Buffer.byteLength(content, 'utf8'),
      created: true,
    })),
    deleteBeanFile: vi.fn(async path => ({ path, deleted: true })),
    ...overrides,
  };
}

/** Boot a real server + client pair over InMemoryTransport. */
async function bootClient(backend: BackendInterface): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const { server } = await createBeansMcpServer({ workspaceRoot: '/ws', backend });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
    },
  };
}

type TextContent = { type: 'text'; text: string };

/** Assert a tool call succeeded and parse the first content item as JSON. */
function parseResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  expect(result.isError).toBeFalsy();
  const items = result.content as TextContent[];
  expect(items.length).toBeGreaterThan(0);
  expect(items[0].type).toBe('text');
  return JSON.parse(items[0].text);
}

/** Assert a tool call produced a validation/tool error (isError: true). */
async function expectError(promise: Promise<Awaited<ReturnType<Client['callTool']>>>): Promise<void> {
  const result = await promise;
  expect(result.isError).toBe(true);
  const items = result.content as TextContent[];
  expect(items.length).toBeGreaterThan(0);
  expect(items[0].text.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

describe('tool registration', () => {
  it('registers all expected tools', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const { tools } = await client.listTools();
      const names = tools.map(t => t.name);

      expect(names).toContain('beans_init');
      expect(names).toContain('beans_archive');
      expect(names).toContain('beans_view');
      expect(names).toContain('beans_create');
      expect(names).toContain('beans_edit');
      expect(names).toContain('beans_update');
      expect(names).toContain('beans_reopen');
      expect(names).toContain('beans_complete_tasks');
      expect(names).toContain('beans_delete');
      expect(names).toContain('beans_query');
      expect(names).toContain('beans_bean_file');
      expect(names).toContain('beans_output');
    } finally {
      await cleanup();
    }
  });

  it('all tools have titles', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.title).toBeTruthy();
      }
    } finally {
      await cleanup();
    }
  });

  it('all tools have descriptions', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
      }
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_init
// ---------------------------------------------------------------------------

describe('beans_init', () => {
  it('calls backend.init and returns initialized: true', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_init', arguments: {} });
      const data = parseResult(result) as { initialized: boolean };
      expect(data.initialized).toBe(true);
      expect(backend.init).toHaveBeenCalledWith(undefined);
    } finally {
      await cleanup();
    }
  });

  it('passes prefix to backend.init', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      await client.callTool({ name: 'beans_init', arguments: { prefix: 'proj' } });
      expect(backend.init).toHaveBeenCalledWith('proj');
    } finally {
      await cleanup();
    }
  });

  it('rejects prefix longer than 32 characters', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_init', arguments: { prefix: 'x'.repeat(33) } }));
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_archive
// ---------------------------------------------------------------------------

describe('beans_archive', () => {
  it('archives completed/scrapped beans via backend', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_archive', arguments: {} });
      const data = parseResult(result) as { archived: boolean; archivedCount: number };
      expect(data.archived).toBe(true);
      expect(data.archivedCount).toBe(1);
      expect(backend.archive).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_view
// ---------------------------------------------------------------------------

describe('beans_view', () => {
  it('returns full bean details', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const result = await client.callTool({ name: 'beans_view', arguments: { beanId: 'bean-1' } });
      const data = parseResult(result) as { bean: BeanRecord };
      expect(data.bean.id).toBe('bean-1');
      expect(data.bean.title).toBe('Fix the thing');
    } finally {
      await cleanup();
    }
  });

  it('returns isError when bean not found', async () => {
    const backend = makeBackend({ list: vi.fn(async () => []) });
    const { client, cleanup } = await bootClient(backend);
    try {
      await expectError(client.callTool({ name: 'beans_view', arguments: { beanId: 'missing' } }));
    } finally {
      await cleanup();
    }
  });

  it('rejects empty beanId', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_view', arguments: { beanId: '' } }));
    } finally {
      await cleanup();
    }
  });

  it('rejects beanId longer than MAX_ID_LENGTH (128)', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_view', arguments: { beanId: 'x'.repeat(129) } }));
    } finally {
      await cleanup();
    }
  });

  it('supports multi-id bean lookup via beanIds', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const result = await client.callTool({ name: 'beans_view', arguments: { beanIds: ['bean-1', 'missing'] } });
      const data = parseResult(result) as { beans: BeanRecord[]; missingBeanIds: string[] };
      expect(data.beans).toHaveLength(1);
      expect(data.missingBeanIds).toEqual(['missing']);
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_create
// ---------------------------------------------------------------------------

describe('beans_create', () => {
  it('creates a bean with required fields', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_create',
        arguments: { title: 'New task', type: 'task' },
      });
      const data = parseResult(result) as { bean: BeanRecord };
      expect(data.bean.title).toBe('New task');
      expect(data.bean.type).toBe('task');
      expect(backend.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task', type: 'task' }));
    } finally {
      await cleanup();
    }
  });

  it('passes optional fields to backend', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      await client.callTool({
        name: 'beans_create',
        arguments: { title: 'T', type: 'bug', status: 'todo', priority: 'high', description: 'desc' },
      });
      expect(backend.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'todo', priority: 'high', description: 'desc' }),
      );
    } finally {
      await cleanup();
    }
  });

  it('rejects missing title', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_create', arguments: { type: 'task' } }));
    } finally {
      await cleanup();
    }
  });

  it('rejects empty title', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_create', arguments: { title: '', type: 'task' } }));
    } finally {
      await cleanup();
    }
  });

  it('rejects missing type', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_create', arguments: { title: 'T' } }));
    } finally {
      await cleanup();
    }
  });

  it('rejects title exceeding MAX_TITLE_LENGTH (1024)', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(
        client.callTool({ name: 'beans_create', arguments: { title: 'x'.repeat(1025), type: 'task' } }),
      );
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_update / beans_edit
// ---------------------------------------------------------------------------

describe('beans_update', () => {
  it('updates a bean status', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_update',
        arguments: { beanId: 'bean-1', status: 'in-progress' },
      });
      const data = parseResult(result) as { bean: BeanRecord };
      expect(data.bean.id).toBe('bean-1');
      expect(backend.update).toHaveBeenCalledWith('bean-1', expect.objectContaining({ status: 'in-progress' }));
    } finally {
      await cleanup();
    }
  });

  it('passes blocking and blockedBy arrays', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      await client.callTool({
        name: 'beans_update',
        arguments: { beanId: 'bean-1', blocking: ['bean-2'], blockedBy: ['bean-3'] },
      });
      expect(backend.update).toHaveBeenCalledWith(
        'bean-1',
        expect.objectContaining({ blocking: ['bean-2'], blockedBy: ['bean-3'] }),
      );
    } finally {
      await cleanup();
    }
  });

  it('rejects missing beanId', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const result = await client.callTool({ name: 'beans_update', arguments: { status: 'todo' } });
      expect(result.isError).toBe(true);
      const items = result.content as TextContent[];
      expect(items[0].text).toContain('beanId');
      expect(items[0].text).toContain('Did you mean `beanId`?');
    } finally {
      await cleanup();
    }
  });

  it('cascades close status to descendants', async () => {
    const beans = [
      { ...BEAN, id: 'bean-1', status: 'todo' },
      { ...BEAN, id: 'child-1', parentId: 'bean-1', status: 'todo' },
      { ...BEAN, id: 'child-2', parentId: 'bean-1', status: 'in-progress' },
    ];
    const backend = makeBackend({ list: vi.fn(async () => beans) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_update',
        arguments: { beanId: 'bean-1', status: 'completed' },
      });

      const data = parseResult(result) as { cascade: { updatedBeanIds: string[] } };
      expect(data.cascade.updatedBeanIds.toSorted((a, b) => a.localeCompare(b))).toEqual(
        ['child-1', 'child-2'].toSorted((a, b) => a.localeCompare(b)),
      );
      expect(backend.update).toHaveBeenCalledWith('child-1', { status: 'completed' });
      expect(backend.update).toHaveBeenCalledWith('child-2', { status: 'completed' });
    } finally {
      await cleanup();
    }
  });

  it('surfaces backend errors as isError result', async () => {
    const backend = makeBackend({
      update: vi.fn(async () => {
        throw new Error('update failed');
      }),
    });
    const { client, cleanup } = await bootClient(backend);
    try {
      await expectError(client.callTool({ name: 'beans_update', arguments: { beanId: 'bean-1', status: 'todo' } }));
    } finally {
      await cleanup();
    }
  });

  it('passes ifMatch through to backend.update', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      await client.callTool({
        name: 'beans_update',
        arguments: { beanId: 'bean-1', status: 'todo', ifMatch: 'etag-1' },
      });
      expect(backend.update).toHaveBeenCalledWith('bean-1', expect.objectContaining({ ifMatch: 'etag-1' }));
    } finally {
      await cleanup();
    }
  });

  it('passes bodyAppend/bodyReplace through to backend.update', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      await client.callTool({
        name: 'beans_update',
        arguments: {
          beanId: 'bean-1',
          bodyAppend: '## Notes',
          bodyReplace: [{ old: '- [ ] A', new: '- [x] A' }],
        },
      });
      expect(backend.update).toHaveBeenCalledWith(
        'bean-1',
        expect.objectContaining({
          bodyAppend: '## Notes',
          bodyReplace: [{ old: '- [ ] A', new: '- [x] A' }],
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it('rejects combining body with bodyAppend/bodyReplace', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(
        client.callTool({
          name: 'beans_update',
          arguments: {
            beanId: 'bean-1',
            body: 'full body',
            bodyAppend: 'append',
          },
        }),
      );
    } finally {
      await cleanup();
    }
  });
});

describe('beans_edit', () => {
  it('is registered and works identically to beans_update', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_edit',
        arguments: { beanId: 'bean-1', type: 'feature' },
      });
      const data = parseResult(result) as { bean: BeanRecord };
      expect(data.bean.id).toBe('bean-1');
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_reopen
// ---------------------------------------------------------------------------

describe('beans_reopen', () => {
  it('reopens a completed bean to todo', async () => {
    const completedBean = { ...BEAN, status: 'completed' };
    const childBean = { ...BEAN, id: 'child-1', parentId: 'bean-1', status: 'completed' };
    const backend = makeBackend({ list: vi.fn(async () => [completedBean, childBean]) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_reopen',
        arguments: { beanId: 'bean-1', requiredCurrentStatus: 'completed', targetStatus: 'todo' },
      });
      expect(result.isError).toBeFalsy();
      expect(backend.update).toHaveBeenCalledWith('bean-1', { status: 'todo' });
      expect(backend.update).toHaveBeenCalledWith('child-1', { status: 'todo' });
    } finally {
      await cleanup();
    }
  });

  it('returns isError if bean status does not match requiredCurrentStatus', async () => {
    // BEAN.status is 'todo', not 'completed'
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(
        client.callTool({
          name: 'beans_reopen',
          arguments: { beanId: 'bean-1', requiredCurrentStatus: 'completed', targetStatus: 'todo' },
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it('rejects unknown requiredCurrentStatus values', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(
        client.callTool({
          name: 'beans_reopen',
          arguments: { beanId: 'bean-1', requiredCurrentStatus: 'todo', targetStatus: 'draft' },
        }),
      );
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_delete
// ---------------------------------------------------------------------------

describe('beans_delete', () => {
  it('deletes a draft bean without force', async () => {
    const draftBean = { ...BEAN, status: 'draft' };
    const backend = makeBackend({ list: vi.fn(async () => [draftBean]) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_delete',
        arguments: { beanId: 'bean-1', force: false },
      });
      const data = parseResult(result) as { deleted: boolean };
      expect(data.deleted).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('refuses to delete a non-draft/non-scrapped bean without force', async () => {
    // BEAN.status is 'todo'
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(
        client.callTool({
          name: 'beans_delete',
          arguments: { beanId: 'bean-1', force: false },
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it('deletes any bean with force=true', async () => {
    const backend = makeBackend(); // BEAN.status = 'todo'
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_delete',
        arguments: { beanId: 'bean-1', force: true },
      });
      const data = parseResult(result) as { deleted: boolean };
      expect(data.deleted).toBe(true);
      expect(backend.delete).toHaveBeenCalledWith('bean-1');
    } finally {
      await cleanup();
    }
  });

  it('defaults force to false — refuses non-draft bean when force omitted', async () => {
    // BEAN is 'todo'; force defaults to false
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_delete', arguments: { beanId: 'bean-1' } }));
    } finally {
      await cleanup();
    }
  });

  it('supports batch deletion via beanIds with summary result', async () => {
    const beans = [
      { ...BEAN, id: 'bean-1', status: 'draft' },
      { ...BEAN, id: 'bean-2', status: 'todo' },
    ];
    const backend = makeBackend({ list: vi.fn(async () => beans) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_delete',
        arguments: { beanIds: ['bean-1', 'bean-2', 'missing'], force: false },
      });
      const data = parseResult(result) as { deletedCount: number; failedCount: number };
      expect(data.deletedCount).toBe(1);
      expect(data.failedCount).toBe(2);
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_query
// ---------------------------------------------------------------------------

describe('beans_query', () => {
  it('refresh returns all beans', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_query', arguments: { operation: 'refresh' } });
      const data = parseResult(result) as { count: number; beans: BeanRecord[] };
      expect(data.count).toBe(1);
      expect(data.beans[0].id).toBe('bean-1');
    } finally {
      await cleanup();
    }
  });

  it('filter passes statuses and types to backend.list', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      await client.callTool({
        name: 'beans_query',
        arguments: { operation: 'filter', statuses: ['todo'], types: ['task'] },
      });
      expect(backend.list).toHaveBeenCalledWith(expect.objectContaining({ status: ['todo'], type: ['task'] }));
    } finally {
      await cleanup();
    }
  });

  it('search passes query to backend.list and filters client-side', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_query',
        arguments: { operation: 'search', search: 'fix' },
      });
      const data = parseResult(result) as { query: string; count: number };
      expect(data.query).toBe('fix');
      expect(data.count).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('search with includeClosed=false excludes completed/scrapped beans', async () => {
    const beans = [BEAN, { ...BEAN, id: 'bean-2', title: 'fix closed', status: 'completed' }];
    const backend = makeBackend({ list: vi.fn(async () => beans) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_query',
        arguments: { operation: 'search', search: 'fix', includeClosed: false },
      });
      const data = parseResult(result) as { count: number; beans: BeanRecord[] };
      expect(data.beans.every(b => b.status !== 'completed' && b.status !== 'scrapped')).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('sort returns beans in the requested order', async () => {
    const beans = [
      { ...BEAN, id: 'bean-a', status: 'completed', updatedAt: '2025-01-01T00:00:00Z' },
      { ...BEAN, id: 'bean-b', status: 'todo', updatedAt: '2025-01-03T00:00:00Z' },
    ];
    const backend = makeBackend({ list: vi.fn(async () => beans) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_query',
        arguments: { operation: 'sort', mode: 'updated' },
      });
      const data = parseResult(result) as { beans: BeanRecord[] };
      expect(data.beans[0].id).toBe('bean-b'); // most recently updated first
    } finally {
      await cleanup();
    }
  });

  it('defaults operation to refresh', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_query', arguments: {} });
      const data = parseResult(result) as { beans: BeanRecord[] };
      expect(Array.isArray(data.beans)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('rejects unknown operation value', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_query', arguments: { operation: 'noop' } }));
    } finally {
      await cleanup();
    }
  });

  it('ready returns actionable todo beans only', async () => {
    const beans = [
      { ...BEAN, id: 'todo-ready', status: 'todo', blockedByIds: ['done'] },
      { ...BEAN, id: 'todo-blocked', status: 'todo', blockedByIds: ['active'] },
      { ...BEAN, id: 'done', status: 'completed' },
      { ...BEAN, id: 'active', status: 'todo' },
      { ...BEAN, id: 'wip', status: 'in-progress', blockedByIds: [] },
    ];
    const backend = makeBackend({ list: vi.fn(async () => beans) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_query', arguments: { operation: 'ready' } });
      const data = parseResult(result) as { count: number; beans: BeanRecord[] };
      expect(data.count).toBe(2);
      expect(data.beans.map(b => b.id).toSorted((a, b) => a.localeCompare(b))).toEqual(
        ['active', 'todo-ready'].toSorted((a, b) => a.localeCompare(b)),
      );
    } finally {
      await cleanup();
    }
  });

  it('llm_context returns prime instructions and optional write path', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_query',
        arguments: { operation: 'llm_context', writeToWorkspaceInstructions: true },
      });
      const data = parseResult(result) as {
        graphqlSchema: string;
        generatedInstructions: string;
        instructionsPath: string | null;
      };
      expect(data.graphqlSchema).toContain('type Query');
      expect(data.generatedInstructions).toBe('PRIME-OUTPUT');
      expect(data.instructionsPath).toContain('beans-prime.instructions.md');
    } finally {
      await cleanup();
    }
  });

  it('graphql operation proxies raw GraphQL to backend.queryGraphql', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_query',
        arguments: { operation: 'graphql', graphql: '{ beans { id } }', variables: { limit: 1 } },
      });
      const data = parseResult(result) as { data: { beans: Array<{ id: string }> } };
      expect(data.data.beans[0]?.id).toBe('bean-1');
      expect(backend.queryGraphql).toHaveBeenCalledWith('{ beans { id } }', { limit: 1 });
    } finally {
      await cleanup();
    }
  });

  it('graphql operation requires graphql string', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_query', arguments: { operation: 'graphql' } }));
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_bean_file
// ---------------------------------------------------------------------------

describe('beans_bean_file', () => {
  it('read returns file content', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_bean_file',
        arguments: { operation: 'read', path: 'bean-1.md' },
      });
      const data = parseResult(result) as { path: string; content: string };
      expect(data.content).toContain('title');
      expect(backend.readBeanFile).toHaveBeenCalledWith('bean-1.md');
    } finally {
      await cleanup();
    }
  });

  it('edit calls editBeanFile with content', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_bean_file',
        arguments: { operation: 'edit', path: 'bean-1.md', content: 'new body' },
      });
      const data = parseResult(result) as { bytes: number };
      expect(data.bytes).toBeGreaterThan(0);
      expect(backend.editBeanFile).toHaveBeenCalledWith('bean-1.md', 'new body');
    } finally {
      await cleanup();
    }
  });

  it('create calls createBeanFile', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_bean_file',
        arguments: { operation: 'create', path: 'new-bean.md', content: '# New' },
      });
      const data = parseResult(result) as { created: boolean };
      expect(data.created).toBe(true);
      expect(backend.createBeanFile).toHaveBeenCalledWith('new-bean.md', '# New', { overwrite: undefined });
    } finally {
      await cleanup();
    }
  });

  it('delete calls deleteBeanFile', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_bean_file',
        arguments: { operation: 'delete', path: 'bean-1.md' },
      });
      const data = parseResult(result) as { deleted: boolean };
      expect(data.deleted).toBe(true);
      expect(backend.deleteBeanFile).toHaveBeenCalledWith('bean-1.md');
    } finally {
      await cleanup();
    }
  });

  it('update_frontmatter atomically updates selected frontmatter fields', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_bean_file',
        arguments: {
          operation: 'update_frontmatter',
          path: 'bean-1.md',
          fields: { pr: '123', branch: 'feature/cascade-status-and-skills-npm' },
        },
      });
      const data = parseResult(result) as { updatedFields: string[]; frontmatter: Record<string, unknown> };
      expect(data.updatedFields.toSorted((a, b) => a.localeCompare(b))).toEqual(
        ['branch', 'pr'].toSorted((a, b) => a.localeCompare(b)),
      );
      expect(data.frontmatter.pr).toBe('123');
      expect(backend.updateBeanFrontmatter).toHaveBeenCalledWith('bean-1.md', {
        pr: '123',
        branch: 'feature/cascade-status-and-skills-npm',
      });
    } finally {
      await cleanup();
    }
  });

  it('rejects empty path', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_bean_file', arguments: { operation: 'read', path: '' } }));
    } finally {
      await cleanup();
    }
  });

  it('rejects update_frontmatter without fields', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(
        client.callTool({
          name: 'beans_bean_file',
          arguments: { operation: 'update_frontmatter', path: 'bean-1.md' },
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it('surfaces backend errors as isError', async () => {
    const backend = makeBackend({
      readBeanFile: vi.fn(async () => {
        throw new Error('file not found');
      }),
    });
    const { client, cleanup } = await bootClient(backend);
    try {
      await expectError(
        client.callTool({
          name: 'beans_bean_file',
          arguments: { operation: 'read', path: 'missing.md' },
        }),
      );
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_output
// ---------------------------------------------------------------------------

describe('beans_output', () => {
  it('read returns log content', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_output', arguments: { operation: 'read' } });
      const data = parseResult(result) as { content: string; linesReturned: number };
      expect(data.content).toContain('line');
      expect(data.linesReturned).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it('show returns a guidance message', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const result = await client.callTool({ name: 'beans_output', arguments: { operation: 'show' } });
      const data = parseResult(result) as { message: string };
      expect(typeof data.message).toBe('string');
      expect(data.message.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it('rejects lines value out of range', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      await expectError(client.callTool({ name: 'beans_output', arguments: { operation: 'read', lines: 0 } }));
    } finally {
      await cleanup();
    }
  });

  it('defaults operation to read', async () => {
    const backend = makeBackend();
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_output', arguments: {} });
      expect(result.isError).toBeFalsy();
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// beans_complete_tasks
// ---------------------------------------------------------------------------

describe('beans_complete_tasks', () => {
  it('marks markdown tasks complete in bean body', async () => {
    const beanWithTasks = {
      ...BEAN,
      body: '- [ ] A\n- [x] B\n1. [ ] C',
    };
    const backend = makeBackend({ list: vi.fn(async () => [beanWithTasks]) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({
        name: 'beans_complete_tasks',
        arguments: { beanId: 'bean-1' },
      });

      const data = parseResult(result) as { updatedTaskCount: number; totalTaskCount: number };
      expect(data.updatedTaskCount).toBe(2);
      expect(data.totalTaskCount).toBe(3);
      expect(backend.update).toHaveBeenCalledWith('bean-1', {
        body: '- [x] A\n- [x] B\n1. [x] C',
      });
    } finally {
      await cleanup();
    }
  });

  it('returns beanId hint when beanId is missing', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const result = await client.callTool({
        name: 'beans_complete_tasks',
        arguments: { id: 'bean-1' },
      });
      expect(result.isError).toBe(true);
      const items = result.content as TextContent[];
      expect(items[0].text).toContain('Did you mean `beanId`?');
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Response shape invariants
// ---------------------------------------------------------------------------

describe('response shape', () => {
  it('every successful response has at least one text content item', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const result = await client.callTool({ name: 'beans_query', arguments: { operation: 'refresh' } });
      const items = result.content as TextContent[];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].type).toBe('text');
    } finally {
      await cleanup();
    }
  });

  it('tool result text is valid JSON', async () => {
    const { client, cleanup } = await bootClient(makeBackend());
    try {
      const result = await client.callTool({ name: 'beans_query', arguments: { operation: 'refresh' } });
      const items = result.content as TextContent[];
      expect(() => JSON.parse(items[0].text)).not.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('isError result contains a non-empty error description', async () => {
    const backend = makeBackend({ list: vi.fn(async () => []) });
    const { client, cleanup } = await bootClient(backend);
    try {
      const result = await client.callTool({ name: 'beans_view', arguments: { beanId: 'nope' } });
      expect(result.isError).toBe(true);
      const items = result.content as TextContent[];
      expect(items[0].text.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// MCP roots — workspace discovery
// ---------------------------------------------------------------------------

describe('MCP roots', () => {
  /**
   * Boot a server+client pair where the client declares roots capability and
   * responds to roots/list with a specific filesystem path.  Used to verify
   * the mechanism that startBeansMcpServer relies on for workspace discovery.
   */
  async function bootWithRoots(
    rootPaths: string[],
  ): Promise<{ server: Awaited<ReturnType<typeof createBeansMcpServer>>['server']; cleanup: () => Promise<void> }> {
    const { server } = await createBeansMcpServer({ workspaceRoot: '/fallback', backend: makeBackend() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    // Create a client that advertises and responds to roots/list.
    const client = new Client({ name: 'roots-test-client', version: '0.0.1' }, { capabilities: { roots: {} } });
    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: rootPaths.map(p => ({ uri: `file://${p}`, name: p })),
    }));

    await client.connect(clientTransport);

    return {
      server,
      cleanup: async () => {
        await client.close();
      },
    };
  }

  it('server can request roots from a client that declares them', async () => {
    const { server, cleanup } = await bootWithRoots(['/my/project']);
    try {
      const { roots } = await server.server.listRoots();
      expect(roots).toHaveLength(1);
      expect(roots[0].uri).toBe('file:///my/project');
    } finally {
      await cleanup();
    }
  });

  it('server receives multiple roots in declaration order', async () => {
    const { server, cleanup } = await bootWithRoots(['/project-a', '/project-b']);
    try {
      const { roots } = await server.server.listRoots();
      expect(roots[0].uri).toBe('file:///project-a');
      expect(roots[1].uri).toBe('file:///project-b');
    } finally {
      await cleanup();
    }
  });

  it('server receives empty roots list when client declares none', async () => {
    const { server, cleanup } = await bootWithRoots([]);
    try {
      const { roots } = await server.server.listRoots();
      expect(roots).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('file:// URIs can be parsed to local paths', async () => {
    const { server, cleanup } = await bootWithRoots(['/Users/daniel/myproject']);
    try {
      const { roots } = await server.server.listRoots();
      const localPath = new URL(roots[0].uri).pathname;
      expect(localPath).toBe('/Users/daniel/myproject');
    } finally {
      await cleanup();
    }
  });
});
