/**
 * Tests for startBeansMcpServer.
 *
 * Dynamic imports of BeansCliBackend and StdioServerTransport are mocked so
 * that the function can run without a real beans CLI or real stdio.  A minimal
 * mock transport satisfies server.connect(); the _resolveRoots test-seam
 * parameter is used to exercise the setInner branch without needing a live
 * MCP client to respond to roots/list.
 */

import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — hoisted by vitest before any imports
// ---------------------------------------------------------------------------

vi.mock('../server/backend', () => {
  // Must be a regular function (not an arrow function) so `new BeansCliBackend()` works.
  function BeansCliBackend(this: unknown) {
    return {
      init: vi.fn(async () => ({ initialized: true })),
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({
        id: 'b1',
        slug: 'b1',
        path: 'b1.md',
        title: 'T',
        body: '',
        status: 'draft',
        type: 'task',
      })),
      update: vi.fn(async () => ({
        id: 'b1',
        slug: 'b1',
        path: 'b1.md',
        title: 'T',
        body: '',
        status: 'todo',
        type: 'task',
      })),
      delete: vi.fn(async () => ({ deleted: true })),
      openConfig: vi.fn(async () => ({ configPath: '/cfg', content: '{}' })),
      graphqlSchema: vi.fn(async () => ''),
      readOutputLog: vi.fn(async () => ({ path: '/log', content: '', linesReturned: 0 })),
      readBeanFile: vi.fn(async () => ({ path: '/f', content: '' })),
      editBeanFile: vi.fn(async () => ({ path: '/f', bytes: 0 })),
      createBeanFile: vi.fn(async () => ({ path: '/f', bytes: 0, created: true })),
      deleteBeanFile: vi.fn(async () => ({ path: '/f', deleted: true })),
    };
  }
  return { BeansCliBackend: vi.fn(BeansCliBackend) };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  // Must be a regular function so `new StdioServerTransport()` works.
  function StdioServerTransport(this: unknown) {
    return {
      start: vi.fn(async () => {}),
      send: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
  }
  return { StdioServerTransport: vi.fn(StdioServerTransport) };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startBeansMcpServer', () => {
  it('starts without error when an explicit workspace root is given', async () => {
    const { startBeansMcpServer } = await import('../server/BeansMcpServer');
    await expect(startBeansMcpServer(['--workspace-root', '/my/workspace'])).resolves.toBeUndefined();
  });

  it('creates StdioServerTransport and connects', async () => {
    const { startBeansMcpServer } = await import('../server/BeansMcpServer');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    vi.mocked(StdioServerTransport).mockClear();

    await startBeansMcpServer(['/some/workspace']);

    expect(vi.mocked(StdioServerTransport)).toHaveBeenCalledTimes(1);
  });

  it('sets BEANS_MCP_PORT env vars from --port', async () => {
    const { startBeansMcpServer } = await import('../server/BeansMcpServer');

    // Use an explicit workspace so resolveWorkspaceFromRoots is not called
    // (the mock transport has no client and would hang waiting for a response).
    await startBeansMcpServer(['--workspace-root', '/w', '--port', '12345']);

    expect(process.env.BEANS_MCP_PORT).toBe('12345');
    expect(process.env.BEANS_VSCODE_MCP_PORT).toBe('12345');
  });

  it('initialises BeansCliBackend with the explicit workspace root', async () => {
    const { startBeansMcpServer } = await import('../server/BeansMcpServer');
    const { BeansCliBackend } = await import('../server/backend');
    vi.mocked(BeansCliBackend).mockClear();

    await startBeansMcpServer(['/explicit/root']);

    // First call: initial backend; explicit flag prevents a second call for setInner.
    expect(vi.mocked(BeansCliBackend)).toHaveBeenCalledWith('/explicit/root', 'beans', expect.any(String));
    expect(vi.mocked(BeansCliBackend)).toHaveBeenCalledTimes(1);
  });

  it('skips roots resolution when workspaceExplicit is true', async () => {
    const { startBeansMcpServer } = await import('../server/BeansMcpServer');
    const resolver = vi.fn(async () => '/should-not-be-used');

    await startBeansMcpServer(['--workspace-root', '/explicit'], resolver);

    expect(resolver).not.toHaveBeenCalled();
  });

  it('calls resolver and calls setInner when resolver returns a path', async () => {
    const { startBeansMcpServer } = await import('../server/BeansMcpServer');
    const { BeansCliBackend } = await import('../server/backend');
    vi.mocked(BeansCliBackend).mockClear();

    const resolver = vi.fn(async () => '/roots/detected/workspace');

    // No explicit workspace → resolver is invoked; non-null rootPath → setInner is called.
    await startBeansMcpServer([], resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    // setInner creates a new BeansCliBackend with the discovered path.
    expect(vi.mocked(BeansCliBackend)).toHaveBeenLastCalledWith('/roots/detected/workspace', 'beans');
  });

  it('does not call setInner when resolver returns null', async () => {
    const { startBeansMcpServer } = await import('../server/BeansMcpServer');
    const { BeansCliBackend } = await import('../server/backend');
    vi.mocked(BeansCliBackend).mockClear();

    const resolver = vi.fn(async () => null);

    await startBeansMcpServer([], resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    // Only the initial BeansCliBackend call; no second call from setInner.
    expect(vi.mocked(BeansCliBackend)).toHaveBeenCalledTimes(1);
  });
});
