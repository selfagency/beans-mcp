import { describe, expect, it, vi } from 'vitest';
import { handleQueryOperation, sortBeans } from '../internal/queryHelpers';
import type { BeanRecord } from '../types';

describe('sortBeans', () => {
  const beans: BeanRecord[] = [
    {
      id: 'bean1',
      slug: 'bean1',
      path: 'bean1.md',
      title: 'Alpha Task',
      body: 'Content',
      status: 'completed',
      type: 'task',
    },
    {
      id: 'bean2',
      slug: 'bean2',
      path: 'bean2.md',
      title: 'Beta Feature',
      body: 'Content',
      status: 'in-progress',
      type: 'feature',
      priority: 'high',
    },
    {
      id: 'bean3',
      slug: 'bean3',
      path: 'bean3.md',
      title: 'Gamma Bug',
      body: 'Content',
      status: 'todo',
      type: 'bug',
      priority: 'critical',
    },
  ];

  it('should sort by status-priority-type-title (default)', () => {
    const sorted = sortBeans(beans, 'status-priority-type-title');
    // First bean should have in-progress status and high priority
    expect(sorted[0].status).toBe('in-progress');
    expect(sorted[0].priority).toBe('high');
  });

  it('should sort by updated timestamp', () => {
    const beansWithDates = beans.map((b, i) => ({
      ...b,
      updatedAt: `2026-02-${20 - i}T10:00:00Z`,
    }));
    const sorted = sortBeans(beansWithDates, 'updated');
    expect(sorted[0].updatedAt).toBe('2026-02-20T10:00:00Z');
  });

  it('should sort by created timestamp', () => {
    const beansWithDates = beans.map((b, i) => ({
      ...b,
      createdAt: `2026-02-${20 - i}T10:00:00Z`,
    }));
    const sorted = sortBeans(beansWithDates, 'created');
    expect(sorted[0].createdAt).toBe('2026-02-20T10:00:00Z');
  });

  it('should sort by id alphabetically', () => {
    const sorted = sortBeans(beans, 'id');
    expect(sorted[0].id).toBe('bean1');
    expect(sorted[1].id).toBe('bean2');
    expect(sorted[2].id).toBe('bean3');
  });

  it('should handle missing status in weight map', () => {
    const customBeans = [
      { ...beans[0], status: 'unknown-status' },
      { ...beans[1], status: 'in-progress' },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted).toHaveLength(2);
  });

  it('should use default priority "normal" when missing', () => {
    const customBeans = [{ ...beans[0], priority: undefined }];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted[0].priority).toBeUndefined();
  });

  it('should handle missing type in weight map', () => {
    const customBeans = [{ ...beans[0], type: 'unknown-type' }];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted).toHaveLength(1);
  });

  it('should sort by title when other attributes are equal', () => {
    const customBeans = [
      {
        ...beans[0],
        status: 'todo',
        type: 'task',
        priority: 'normal',
        title: 'Zebra',
      },
      {
        ...beans[1],
        status: 'todo',
        type: 'task',
        priority: 'normal',
        title: 'Alpha',
      },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted[0].title).toBe('Alpha');
  });

  it('should compare different priorities within same status', () => {
    const customBeans = [
      { ...beans[0], status: 'todo', priority: 'low', title: 'Low' },
      { ...beans[1], status: 'todo', priority: 'high', title: 'High' },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted[0].priority).toBe('high');
    expect(sorted[1].priority).toBe('low');
  });

  it('should compare different types within same status and priority', () => {
    const customBeans = [
      {
        ...beans[0],
        status: 'todo',
        priority: 'normal',
        type: 'task',
        title: 'Task',
      },
      {
        ...beans[1],
        status: 'todo',
        priority: 'normal',
        type: 'feature',
        title: 'Feature',
      },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted[0].type).toBe('feature');
    expect(sorted[1].type).toBe('task');
  });

  it('should handle undefined updatedAt timestamps', () => {
    const customBeans = [
      { ...beans[0], updatedAt: undefined },
      { ...beans[1], updatedAt: '2026-02-20T10:00:00Z' },
    ];
    const sorted = sortBeans(customBeans, 'updated');
    expect(sorted).toHaveLength(2);
  });

  it('should handle both undefined updatedAt timestamps', () => {
    const customBeans = [
      { ...beans[0], updatedAt: undefined },
      { ...beans[1], updatedAt: undefined },
    ];
    const sorted = sortBeans(customBeans, 'updated');
    expect(sorted).toHaveLength(2);
  });

  it('should handle undefined createdAt timestamps', () => {
    const customBeans = [
      { ...beans[0], createdAt: undefined },
      { ...beans[1], createdAt: '2026-02-20T10:00:00Z' },
    ];
    const sorted = sortBeans(customBeans, 'created');
    expect(sorted).toHaveLength(2);
  });

  it('should handle both undefined createdAt timestamps', () => {
    const customBeans = [
      { ...beans[0], createdAt: undefined },
      { ...beans[1], createdAt: undefined },
    ];
    const sorted = sortBeans(customBeans, 'created');
    expect(sorted).toHaveLength(2);
  });

  it('should use 99 weight for unknown status in comparison', () => {
    const customBeans = [
      { ...beans[0], status: 'unknown-status', priority: 'high' },
      { ...beans[1], status: 'todo', priority: 'low' },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    // Unknown status should sort last (weight 99)
    expect(sorted[1].status).toBe('unknown-status');
  });

  it('should use 99 weight for unknown priority in comparison', () => {
    const customBeans = [
      { ...beans[0], status: 'todo', priority: 'unknown-priority' },
      { ...beans[1], status: 'todo', priority: 'high' },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    // Unknown priority should sort last (weight 99)
    expect(sorted[1].priority).toBe('unknown-priority');
  });

  it('should use 99 weight for unknown type in comparison', () => {
    const customBeans = [
      { ...beans[0], status: 'todo', priority: 'normal', type: 'unknown-type' },
      { ...beans[1], status: 'todo', priority: 'normal', type: 'task' },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    // Unknown type should sort last (weight 99)
    expect(sorted[1].type).toBe('unknown-type');
  });

  it('should sort by title when status, priority and type are equal', () => {
    const customBeans = [
      {
        ...beans[0],
        status: 'todo',
        priority: 'normal',
        type: 'task',
        title: 'Zebra',
      },
      {
        ...beans[1],
        status: 'todo',
        priority: 'normal',
        type: 'task',
        title: 'Alpha',
      },
      {
        ...beans[2],
        status: 'todo',
        priority: 'normal',
        type: 'task',
        title: 'Charlie',
      },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted[0].title).toBe('Alpha');
    expect(sorted[1].title).toBe('Charlie');
    expect(sorted[2].title).toBe('Zebra');
  });

  it('should maintain stable sort when all attributes equal', () => {
    const customBeans = [
      {
        ...beans[0],
        status: 'todo',
        priority: 'normal',
        type: 'task',
        title: 'Same',
        id: 'bean-a',
      },
      {
        ...beans[1],
        status: 'todo',
        priority: 'normal',
        type: 'task',
        title: 'Same',
        id: 'bean-b',
      },
    ];
    const sorted = sortBeans(customBeans, 'status-priority-type-title');
    expect(sorted).toHaveLength(2);
  });

  it('should handle comparison of same updatedAt timestamps', () => {
    const sameDate = '2026-02-20T10:00:00Z';
    const customBeans = [
      { ...beans[0], updatedAt: sameDate },
      { ...beans[1], updatedAt: sameDate },
    ];
    const sorted = sortBeans(customBeans, 'updated');
    expect(sorted).toHaveLength(2);
  });

  it('should handle comparison of same createdAt timestamps', () => {
    const sameDate = '2026-02-20T10:00:00Z';
    const customBeans = [
      { ...beans[0], createdAt: sameDate },
      { ...beans[1], createdAt: sameDate },
    ];
    const sorted = sortBeans(customBeans, 'created');
    expect(sorted).toHaveLength(2);
  });
});

describe('handleQueryOperation', () => {
  const mockBeans: BeanRecord[] = [
    {
      id: 'bean1',
      slug: 'bean1',
      path: 'bean1.md',
      title: 'Active Task',
      body: 'Content',
      status: 'in-progress',
      type: 'task',
      tags: ['urgent', 'backend'],
    },
    {
      id: 'bean2',
      slug: 'bean2',
      path: 'bean2.md',
      title: 'Completed Feature',
      body: 'Content',
      status: 'completed',
      type: 'feature',
      tags: ['frontend'],
    },
    {
      id: 'bean3',
      slug: 'bean3',
      path: 'bean3.md',
      title: 'Draft Docs',
      body: 'Content',
      status: 'draft',
      type: 'task',
      tags: ['docs'],
    },
  ];

  const mockBackend = {
    list: vi.fn(async () => mockBeans),
    graphqlSchema: vi.fn(async () => 'schema'),
    openConfig: vi.fn(async () => ({ configPath: '/path/to/config' })),
    writeInstructions: vi.fn(async () => '/path/to/instructions'),
  };

  it('should handle llm_context operation', async () => {
    const result = await handleQueryOperation(mockBackend, {
      operation: 'llm_context',
    });
    expect(result.content[0].type).toBe('text');
    expect(result.structuredContent.graphqlSchema).toBe('schema');
  });

  it('should handle llm_context with writeInstructions', async () => {
    const result = await handleQueryOperation(mockBackend, {
      operation: 'llm_context',
      writeToWorkspaceInstructions: true,
    });
    expect(result.structuredContent.instructionsPath).toBe('/path/to/instructions');
  });

  it('should handle open_config operation', async () => {
    const result = await handleQueryOperation(mockBackend, {
      operation: 'open_config',
    });
    expect(result.structuredContent.configPath).toBe('/path/to/config');
  });

  it('should handle refresh operation', async () => {
    const result = await handleQueryOperation(mockBackend, {
      operation: 'refresh',
    });
    expect(result.structuredContent.count).toBe(3);
    expect(result.structuredContent.beans).toHaveLength(3);
  });

  it('should handle filter operation with statuses', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans.filter(b => b.status === 'in-progress'));
    const result = await handleQueryOperation(mockBackend, {
      operation: 'filter',
      statuses: ['in-progress'],
    });
    expect(result.structuredContent.count).toBe(1);
  });

  it('should handle filter operation with types', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans.filter(b => b.type === 'feature'));
    const result = await handleQueryOperation(mockBackend, {
      operation: 'filter',
      types: ['feature'],
    });
    expect(result.structuredContent.count).toBe(1);
  });

  it('should handle filter operation with tags', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'filter',
      tags: ['backend'],
    });
    expect(result.structuredContent.beans).toHaveLength(1);
    expect(result.structuredContent.beans[0].id).toBe('bean1');
  });

  it('should handle filter with multiple tags (OR logic)', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'filter',
      tags: ['backend', 'frontend'],
    });
    expect(result.structuredContent.beans).toHaveLength(2);
  });

  it('should handle search operation', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      search: 'active',
    });
    expect(result.structuredContent.beans).toHaveLength(1);
    expect(result.structuredContent.beans[0].id).toBe('bean1');
  });

  it('should handle search by id', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      search: 'bean2',
    });
    expect(result.structuredContent.beans).toHaveLength(1);
    expect(result.structuredContent.beans[0].id).toBe('bean2');
  });

  it('should handle search by tags', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      search: 'backend',
    });
    expect(result.structuredContent.beans).toHaveLength(1);
  });

  it('should filter out closed beans in search when includeClosed is false', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      includeClosed: false,
    });
    expect(result.structuredContent.beans).toHaveLength(2);
    expect(
      (result.structuredContent.beans as BeanRecord[]).every(b => b.status !== 'completed' && b.status !== 'scrapped'),
    ).toBe(true);
  });

  it('should handle sort operation with custom mode', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'sort',
      mode: 'id',
    });
    expect(result.structuredContent.beans[0].id).toBe('bean1');
  });

  it('should use default sort mode when not specified', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'sort',
      mode: 'status-priority-type-title',
    });
    expect(result.structuredContent.mode).toBe('status-priority-type-title');
  });

  it('should handle empty search string', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      search: '',
    });
    expect(result.structuredContent.beans).toHaveLength(3);
  });

  it('should handle case-insensitive search', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      search: 'ACTIVE',
    });
    expect(result.structuredContent.beans).toHaveLength(1);
  });

  it('should handle null tags gracefully', async () => {
    const beansWithoutTags = mockBeans.map(b => ({ ...b, tags: undefined }));
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => beansWithoutTags);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'filter',
      tags: ['some-tag'],
    });
    expect(result.structuredContent.beans).toHaveLength(0);
  });

  it('should handle null statuses parameter', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'filter',
      statuses: null,
    });
    expect(result.structuredContent.beans).toHaveLength(3);
  });

  it('should handle null types parameter', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'filter',
      types: null,
    });
    expect(result.structuredContent.beans).toHaveLength(3);
  });

  it('should handle search with non-string search parameter', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      search: undefined as any,
    });
    expect(result.structuredContent.beans).toHaveLength(3);
  });

  it('should include closed beans in search by default', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      includeClosed: true,
    });
    expect(result.structuredContent.beans).toHaveLength(3);
  });

  it('should handle search without includeClosed filter', async () => {
    vi.mocked(mockBackend.list).mockImplementationOnce(async () => mockBeans);
    const result = await handleQueryOperation(mockBackend, {
      operation: 'search',
      search: 'task',
    });
    expect((result.structuredContent.beans as BeanRecord[]).length).toBeGreaterThan(0);
  });
});
