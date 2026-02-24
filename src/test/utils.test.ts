import { describe, expect, it } from 'vitest';
import { isPathWithinRoot } from '../utils';

describe('isPathWithinRoot', () => {
  it('should return true for paths within root', () => {
    const root = '/workspace/.beans';
    const target = '/workspace/.beans/file.md';
    expect(isPathWithinRoot(root, target)).toBe(true);
  });

  it('should return false for paths outside root', () => {
    const root = '/workspace/.beans';
    const target = '/workspace/outside.md';
    expect(isPathWithinRoot(root, target)).toBe(false);
  });

  it('should return false for paths with parent traversal', () => {
    const root = '/workspace/.beans';
    const target = '/workspace/.beans/../../etc/passwd';
    expect(isPathWithinRoot(root, target)).toBe(false);
  });

  it('should handle relative path normalization', () => {
    const root = '/workspace/.beans/';
    const target = '/workspace/.beans/subdir/file.md';
    expect(isPathWithinRoot(root, target)).toBe(true);
  });
});
