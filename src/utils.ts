import { isAbsolute, relative, resolve } from 'node:path';

/**
 * Check whether `target` is contained within `root` after resolving both paths.
 * Guards against the Windows cross-drive bypass where `path.relative(root, target)`
 * returns an absolute path (e.g. `D:\evil`) that does not start with `..`.
 */
export function isPathWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

export function makeTextAndStructured<T extends Record<string, unknown>>(value: T) {
  // Return JSON in text content only to avoid duplicate rendering in some clients.
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}
