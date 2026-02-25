import { describe, expect, it, vi } from 'vitest';
import {
  beanFileHandler,
  createHandler,
  deleteHandler,
  editHandler,
  getBeanById,
  initHandler,
  outputHandler,
  queryHandler,
  reopenHandler,
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
    createBeanFile: vi.fn(async (path: string, content: string, opts: any) => ({
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
    expect(res.structuredContent).toBeDefined();
  });

  it('viewHandler returns bean structured content', async () => {
    const backend = makeBackend();
    const res = await viewHandler(backend)({ beanId: 'b1' });
    expect(res.structuredContent.bean.id).toBe('b1');
  });

  it('createHandler delegates to backend.create', async () => {
    const backend = makeBackend();
    const res = await createHandler(backend)({ title: 'T', type: 't' });
    expect(backend.create).toHaveBeenCalled();
    expect(res.structuredContent.bean.id).toBe('new');
  });

  it('editHandler delegates to backend.update', async () => {
    const backend = makeBackend();
    const res = await editHandler(backend)({ beanId: 'b1', status: 'todo' });
    expect(backend.update).toHaveBeenCalledWith('b1', { status: 'todo' });
    expect(res.structuredContent.bean.status).toBe('todo');
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
    expect(res.structuredContent.bean.status).toBe('todo');
  });

  it('deleteHandler enforces draft/scrapped unless force', async () => {
    const backend = makeBackend();
    await expect(deleteHandler(backend)({ beanId: 'b1', force: false })).rejects.toThrow(
      /Only draft and scrapped beans are deletable/,
    );
    const res = await deleteHandler(backend)({ beanId: 'b1', force: true });
    expect(backend.delete).toHaveBeenCalledWith('b1');
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
    const _del = await beanFileHandler(backend)({
      operation: 'delete',
      path: 'p',
    });
    expect(backend.deleteBeanFile).toHaveBeenCalledWith('p');
  });

  it('outputHandler read and show', async () => {
    const backend = makeBackend();
    const _r = await outputHandler(backend)({ operation: 'read', lines: 10 });
    expect(backend.readOutputLog).toHaveBeenCalled();
    const s = await outputHandler(backend)({ operation: 'show' });
    if ('message' in s.structuredContent) {
      expect(s.structuredContent.message).toMatch(/When using VS Code UI/);
    } else {
      throw new Error('expected message in structuredContent');
    }
  });

  it('queryHandler delegates to handleQueryOperation', async () => {
    const backend = makeBackend();
    const res = await queryHandler(backend)({ operation: 'refresh' });
    // handleQueryOperation returns value directly; ensure promise resolves
    expect(res).toBeDefined();
  });
});
