import { describe, expect, it } from 'vitest';
import { isPathWithinRoot, makeTextAndStructured } from '../utils';

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

  it('should return false when root and target are the same', () => {
    const root = '/workspace/.beans';
    const target = '/workspace/.beans';
    expect(isPathWithinRoot(root, target)).toBe(false);
  });

  it('should handle paths with trailing slashes', () => {
    const root = '/workspace/.beans/';
    const target = '/workspace/.beans/file.md';
    expect(isPathWithinRoot(root, target)).toBe(true);
  });
});

describe('makeTextAndStructured', () => {
  it('should serialize object as JSON text', () => {
    const input = { name: 'test', value: 42 } as const;
    const result = makeTextAndStructured(input);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    expect(JSON.parse(result.content[0].text)).toEqual(input);
  });

  it('should preserve arbitrary fields', () => {
    const input = { message: 'Operation completed', extra: { ok: true } } as const;
    const result = makeTextAndStructured(input as any);
    expect(JSON.parse(result.content[0].text)).toEqual(input);
  });

  it('should include nested bean objects in JSON text', () => {
    const input = { bean: { id: 'b1', title: 'My Bean' } } as const;
    const result = makeTextAndStructured(input as any);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(input);
  });

  it('should handle arrays in JSON text', () => {
    const input = { items: [1, 2, 3] };
    const result = makeTextAndStructured(input);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.items).toEqual([1, 2, 3]);
  });

  it('should handle null and undefined values', () => {
    const input = { nullValue: null, undefinedValue: undefined } as any;
    const result = makeTextAndStructured(input);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nullValue).toBeNull();
    // Note: undefined properties are omitted by JSON.stringify
    expect(Object.prototype.hasOwnProperty.call(parsed, 'undefinedValue')).toBe(false);
  });
});
