import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BeansCliBackend } from '../server/backend';

const tempDirs: string[] = [];

async function createWorkspaceWithBean(initialContent: string) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'beans-mcp-frontmatter-'));
  tempDirs.push(workspaceRoot);

  await mkdir(join(workspaceRoot, '.beans'), { recursive: true });
  const beanPath = join(workspaceRoot, '.beans', 'bean.md');
  await writeFile(beanPath, initialContent, 'utf8');

  return {
    workspaceRoot,
    beanPath,
    backend: new BeansCliBackend(workspaceRoot, 'beans'),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('BeansCliBackend.updateBeanFrontmatter', () => {
  it('atomically updates frontmatter fields and preserves body', async () => {
    const { backend, beanPath } = await createWorkspaceWithBean(
      `---\n# bean-1\ntitle: Old title\nstatus: todo\ntype: task\npriority: normal\ncreated_at: 2026-03-13T19:29:47Z\nupdated_at: 2026-03-13T19:36:05Z\n---\n\n## Todo\n- [ ] Work\n`,
    );

    const result = await backend.updateBeanFrontmatter('bean.md', {
      title: 'New title',
      pr: '123',
      branch: 'feature/cascade-status-and-skills-npm',
    });

    expect(result.updatedFields.sort()).toEqual(['branch', 'pr', 'title'].sort());
    expect(result.frontmatter.title).toBe('New title');
    expect(result.frontmatter.pr).toBe('123');
    expect(result.frontmatter.branch).toBe('feature/cascade-status-and-skills-npm');

    const content = await readFile(beanPath, 'utf8');
    expect(content).toContain('title: "New title"');
    expect(content).toContain('pr: 123');
    expect(content).toContain('branch: "feature/cascade-status-and-skills-npm"');
    expect(content).toContain('## Todo\n- [ ] Work');
  });

  it('removes nullable frontmatter fields when null is provided', async () => {
    const { backend, beanPath } = await createWorkspaceWithBean(
      `---\ntitle: Keep title\npr: 123\nbranch: "feature/x"\n---\nBody\n`,
    );

    const result = await backend.updateBeanFrontmatter('bean.md', {
      pr: null,
      branch: null,
    });

    expect(result.frontmatter.pr).toBeUndefined();
    expect(result.frontmatter.branch).toBeUndefined();

    const content = await readFile(beanPath, 'utf8');
    expect(content).not.toContain('pr:');
    expect(content).not.toContain('branch:');
    expect(content).toContain('Body');
  });
});
