import { describe, expect, it, vi } from 'vitest';
import {
  archiveHandler,
  beanFileHandler,
  bulkCreateHandler,
  completeTasksHandler,
  createHandler,
  deleteHandler,
  editHandler,
  getBeanById,
  initHandler,
  outputHandler,
  queryHandler,
  reopenHandler,
  updateHandler,
  viewHandler,
} from '../server/BeansMcpServer';

const sampleBean = {
  id: 'b1',
  slug: 'b1',
  path: '.beans/b1.md',
  title: 'B1',
  body: 'body',
  status: 'completed',
  type: 'task',
};

function makeBackend(overrides: Partial<any> = {}) {
  return {
    list: vi.fn(async () => [sampleBean, { ...sampleBean, id: 'b2', status: 'draft' }]),
    init: vi.fn(async (p?: string) => ({ ok: true, prefix: p })),
    create: vi.fn(async (input: any) => ({
      ...sampleBean,
      ...input,
      id: 'new',
    })),
    update: vi.fn(async (id: string, updates: any) => ({
      ...sampleBean,
      id,
      ...updates,
    })),
    delete: vi.fn(async (id: string) => ({ ok: true, id })),
    openConfig: vi.fn(async () => ({ configPath: '.beans.yml', content: 'x' })),
    graphqlSchema: vi.fn(async () => ''),
    readOutputLog: vi.fn(async ({ lines }: any) => ({
      path: 'p',
      content: 'log',
      linesReturned: lines ?? 0,
    })),
    readBeanFile: vi.fn(async (path: string) => ({ path, content: 'x' })),
    editBeanFile: vi.fn(async (path: string, content: string) => ({
      path,
      bytes: Buffer.byteLength(content, 'utf8'),
    })),
    updateBeanFrontmatter: vi.fn(async (path: string, updates: Record<string, unknown>) => ({
      path,
      bytes: 12,
      updatedFields: Object.keys(updates),
      frontmatter: updates,
    })),
    createBeanFile: vi.fn(async (path: string, content: string, _opts: any) => ({
      path,
      bytes: Buffer.byteLength(content, 'utf8'),
      created: true,
    })),
    deleteBeanFile: vi.fn(async (path: string) => ({ path, deleted: true })),
    ...overrides,
  };
}

describe('Handlers (unit)', () => {
  it('getBeanById returns bean when found', async () => {
    const backend = makeBackend();
    const b = await getBeanById(backend, 'b1');
    expect(b.id).toBe('b1');
  });

  it('getBeanById throws when not found', async () => {
    const backend = makeBackend({ list: vi.fn(async () => []) });
    await expect(getBeanById(backend, 'missing')).rejects.toThrow(/Bean not found/);
  });

  it('initHandler calls backend.init and wraps result', async () => {
    const backend = makeBackend();
    const res = await initHandler(backend)({ prefix: 'pfx' });
    expect(backend.init).toHaveBeenCalledWith('pfx');
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data).toBeDefined();
  });

  it('archiveHandler delegates to backend.archive', async () => {
    const backend = makeBackend({ archive: vi.fn(async () => ({ archived: true, archivedCount: 2 })) });
    const res = await archiveHandler(backend)({} as never);
    expect(backend.archive).toHaveBeenCalled();
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.archived).toBe(true);
    expect(data.archivedCount).toBe(2);
  });

  it('viewHandler returns bean structured content', async () => {
    const backend = makeBackend();
    const res = await viewHandler(backend)({ beanId: 'b1' });
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.bean.id).toBe('b1');
  });

  it('viewHandler supports multiple bean ids and reports missing ids', async () => {
    const backend = makeBackend();
    const res = await viewHandler(backend)({ beanIds: ['b1', 'missing'] });
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.beans).toHaveLength(1);
    expect(data.missingBeanIds).toEqual(['missing']);
  });

  it('createHandler delegates to backend.create', async () => {
    const backend = makeBackend();
    const res = await createHandler(backend)({ title: 'T', type: 't' });
    expect(backend.create).toHaveBeenCalled();
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.bean.id).toBe('new');
  });

  it('createHandler emits deprecation warning when description is used', async () => {
    const backend = makeBackend();
    const res = await createHandler(backend)({ title: 'T', type: 't', description: 'deprecated body' });
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.warnings).toEqual(['`description` is deprecated; use `body` instead.']);
  });

  it('editHandler delegates to backend.update', async () => {
    const backend = makeBackend();
    const res = await editHandler(backend)({ beanId: 'b1', status: 'todo' });
    expect(backend.update).toHaveBeenCalledWith('b1', { status: 'todo' });
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.bean.status).toBe('todo');
  });

  it('updateHandler delegates body updates to backend.update', async () => {
    const backend = makeBackend({
      update: vi.fn(async (id: string, updates: any) => ({
        ...sampleBean,
        id,
        ...updates,
      })),
    });
    const res = await updateHandler(backend)({ beanId: 'b1', body: 'new body text' } as any);
    expect(backend.update).toHaveBeenCalledWith('b1', expect.objectContaining({ body: 'new body text' }));
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.bean.body).toBe('new body text');
  });

  it('updateHandler passes ifMatch through to backend.update', async () => {
    const backend = makeBackend();
    await updateHandler(backend)({ beanId: 'b1', ifMatch: 'etag-123' } as any);
    expect(backend.update).toHaveBeenCalledWith('b1', expect.objectContaining({ ifMatch: 'etag-123' }));
  });

  it('updateHandler passes bodyAppend/bodyReplace through to backend.update', async () => {
    const backend = makeBackend();
    await updateHandler(backend)({
      beanId: 'b1',
      bodyAppend: '## Notes',
      bodyReplace: [{ old: '- [ ] A', new: '- [x] A' }],
    } as any);
    expect(backend.update).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({
        bodyAppend: '## Notes',
        bodyReplace: [{ old: '- [ ] A', new: '- [x] A' }],
      }),
    );
  });

  it('reopenHandler throws if current status mismatches', async () => {
    const backend = makeBackend();
    await expect(
      reopenHandler(backend)({
        beanId: 'b1',
        requiredCurrentStatus: 'scrapped',
        targetStatus: 'todo',
      }),
    ).rejects.toThrow(/is not scrapped/);
  });

  it('reopenHandler updates when status matches', async () => {
    const backend = makeBackend();
    const res = await reopenHandler(backend)({
      beanId: 'b1',
      requiredCurrentStatus: 'completed',
      targetStatus: 'todo',
    });
    expect(backend.update).toHaveBeenCalled();
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.bean.status).toBe('todo');
  });

  it('reopenHandler cascades reopen to closed descendants', async () => {
    const backend = makeBackend({
      list: vi.fn(async () => [
        { ...sampleBean, id: 'parent', status: 'completed' },
        { ...sampleBean, id: 'child-1', parentId: 'parent', status: 'completed' },
        { ...sampleBean, id: 'child-2', parentId: 'parent', status: 'scrapped' },
        { ...sampleBean, id: 'child-3', parentId: 'parent', status: 'todo' },
      ]),
      update: vi.fn(async (id: string, updates: any) => ({
        ...sampleBean,
        id,
        ...updates,
      })),
    });

    const res = await reopenHandler(backend)({
      beanId: 'parent',
      requiredCurrentStatus: 'completed',
      targetStatus: 'todo',
    });

    expect(backend.update).toHaveBeenCalledWith('parent', { status: 'todo' });
    expect(backend.update).toHaveBeenCalledWith('child-1', { status: 'todo' });
    expect(backend.update).toHaveBeenCalledWith('child-2', { status: 'todo' });

    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.cascade.updatedBeanIds.sort()).toEqual(['child-1', 'child-2'].sort());
    expect(data.cascade.skippedBeanIds).toEqual(['child-3']);
  });

  it('updateHandler cascades close status to descendants', async () => {
    const backend = makeBackend({
      list: vi.fn(async () => [
        { ...sampleBean, id: 'parent', status: 'todo' },
        { ...sampleBean, id: 'child-1', parentId: 'parent', status: 'todo' },
        { ...sampleBean, id: 'child-2', parentId: 'parent', status: 'in-progress' },
      ]),
      update: vi.fn(async (id: string, updates: any) => ({
        ...sampleBean,
        id,
        ...updates,
      })),
    });

    const res = await updateHandler(backend)({ beanId: 'parent', status: 'completed' } as any);
    expect(backend.update).toHaveBeenCalledWith('parent', expect.objectContaining({ status: 'completed' }));
    expect(backend.update).toHaveBeenCalledWith('child-1', { status: 'completed' });
    expect(backend.update).toHaveBeenCalledWith('child-2', { status: 'completed' });

    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.cascade.updatedBeanIds.sort()).toEqual(['child-1', 'child-2'].sort());
  });

  it('completeTasksHandler marks markdown tasks complete', async () => {
    const backend = makeBackend({
      list: vi.fn(async () => [
        {
          ...sampleBean,
          id: 'b1',
          body: '- [ ] Task 1\n- [x] Task 2\n1. [ ] Task 3',
        },
      ]),
      update: vi.fn(async (id: string, updates: any) => ({
        ...sampleBean,
        id,
        ...updates,
      })),
    });

    const res = await completeTasksHandler(backend)({ beanId: 'b1' });
    expect(backend.update).toHaveBeenCalledWith('b1', {
      body: '- [x] Task 1\n- [x] Task 2\n1. [x] Task 3',
    });

    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.totalTaskCount).toBe(3);
    expect(data.updatedTaskCount).toBe(2);
  });

  it('deleteHandler enforces draft/scrapped unless force', async () => {
    const backend = makeBackend();
    await expect(deleteHandler(backend)({ beanId: 'b1', force: false })).rejects.toThrow(
      /Only draft and scrapped beans are deletable/,
    );
    await deleteHandler(backend)({ beanId: 'b1', force: true });
    expect(backend.delete).toHaveBeenCalledWith('b1');
  });

  it('deleteHandler supports batch deletion with per-item results', async () => {
    const backend = makeBackend();
    const res = await deleteHandler(backend)({ beanIds: ['b2', 'missing', 'b1'], force: false } as any);
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.requestedCount).toBe(3);
    expect(data.deletedCount).toBe(1);
    expect(data.failedCount).toBe(2);
    expect(data.results.some((r: any) => r.beanId === 'missing' && r.deleted === false)).toBe(true);
  });

  it('beanFileHandler routes operations', async () => {
    const backend = makeBackend();
    const _read = await beanFileHandler(backend)({
      operation: 'read',
      path: 'p',
    });
    expect(backend.readBeanFile).toHaveBeenCalledWith('p');
    const _edit = await beanFileHandler(backend)({
      operation: 'edit',
      path: 'p',
      content: 'c',
    });
    expect(backend.editBeanFile).toHaveBeenCalledWith('p', 'c');
    const _create = await beanFileHandler(backend)({
      operation: 'create',
      path: 'p',
      content: 'c',
      overwrite: true,
    });
    expect(backend.createBeanFile).toHaveBeenCalled();
    const _frontmatter = await beanFileHandler(backend)({
      operation: 'update_frontmatter',
      path: 'p',
      fields: { pr: '123', branch: 'feature/x' },
    });
    expect(backend.updateBeanFrontmatter).toHaveBeenCalledWith('p', { pr: '123', branch: 'feature/x' });
    const _del = await beanFileHandler(backend)({
      operation: 'delete',
      path: 'p',
    });
    expect(backend.deleteBeanFile).toHaveBeenCalledWith('p');
  });

  it('beanFileHandler throws on unsupported operation', async () => {
    const backend = makeBackend();
    await expect(beanFileHandler(backend)({ operation: 'noop' as 'read', path: 'p' })).rejects.toThrow(
      'Unsupported operation',
    );
  });

  it('outputHandler read and show', async () => {
    const backend = makeBackend();
    const _r = await outputHandler(backend)({ operation: 'read', lines: 10 });
    expect(backend.readOutputLog).toHaveBeenCalled();
    const s = await outputHandler(backend)({ operation: 'show' });
    const data = JSON.parse(s.content?.[0]?.text ?? '{}');
    expect(data.message).toMatch(/When using VS Code UI/);
  });

  it('queryHandler delegates to handleQueryOperation', async () => {
    const backend = makeBackend();
    const res = await queryHandler(backend)({ operation: 'refresh' });
    // handleQueryOperation returns value directly; ensure promise resolves
    expect(res).toBeDefined();
  });

  it('queryHandler supports graphql passthrough operation', async () => {
    const backend = makeBackend({
      queryGraphql: vi.fn(async (_query: string, _variables: any) => ({
        data: { beans: [{ id: 'b1' }] },
        errors: [],
      })),
    });

    const res = await queryHandler(backend)({
      operation: 'graphql',
      graphql: '{ beans { id } }',
      variables: { limit: 1 },
    });

    expect(backend.queryGraphql).toHaveBeenCalledWith('{ beans { id } }', { limit: 1 });
    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.data.beans[0].id).toBe('b1');
  });

  it('bulkCreateHandler emits warning summary for deprecated description usage', async () => {
    const backend = makeBackend({
      bulkCreate: vi.fn(async () => [
        { bean: { ...sampleBean, id: 'new-1' } },
        { bean: { ...sampleBean, id: 'new-2' } },
      ]),
    });

    const res = await bulkCreateHandler(backend)({
      beans: [
        { title: 'A', type: 'task', description: 'legacy' },
        { title: 'B', type: 'task' },
      ],
    });

    const data = JSON.parse(res.content?.[0]?.text ?? '{}');
    expect(data.warnings).toEqual(['Found 1 bean(s) using deprecated field `description`; use `body` instead.']);
  });
});
