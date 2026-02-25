import { describe, expect, it } from "vitest";
import { isPathWithinRoot, makeTextAndStructured } from "../utils";

describe("isPathWithinRoot", () => {
  it("should return true for paths within root", () => {
    const root = "/workspace/.beans";
    const target = "/workspace/.beans/file.md";
    expect(isPathWithinRoot(root, target)).toBe(true);
  });

  it("should return false for paths outside root", () => {
    const root = "/workspace/.beans";
    const target = "/workspace/outside.md";
    expect(isPathWithinRoot(root, target)).toBe(false);
  });

  it("should return false for paths with parent traversal", () => {
    const root = "/workspace/.beans";
    const target = "/workspace/.beans/../../etc/passwd";
    expect(isPathWithinRoot(root, target)).toBe(false);
  });

  it("should handle relative path normalization", () => {
    const root = "/workspace/.beans/";
    const target = "/workspace/.beans/subdir/file.md";
    expect(isPathWithinRoot(root, target)).toBe(true);
  });

  it("should return false when root and target are the same", () => {
    const root = "/workspace/.beans";
    const target = "/workspace/.beans";
    expect(isPathWithinRoot(root, target)).toBe(false);
  });

  it("should handle paths with trailing slashes", () => {
    const root = "/workspace/.beans/";
    const target = "/workspace/.beans/file.md";
    expect(isPathWithinRoot(root, target)).toBe(true);
  });
});

describe("makeTextAndStructured", () => {
  it("should create text and structured content from object", () => {
    const input = { name: "test", value: 42 };
    const result = makeTextAndStructured(input);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.structuredContent).toEqual(input);
  });

  it("should serialize content as JSON", () => {
    const input = { key: "value", nested: { deep: true } };
    const result = makeTextAndStructured(input);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(input);
  });

  it("should format JSON with proper indentation", () => {
    const input = { a: 1 };
    const result = makeTextAndStructured(input);

    expect(result.content[0].text).toContain("\n");
  });

  it("should handle arrays in structured content", () => {
    const input = { items: [1, 2, 3] };
    const result = makeTextAndStructured(input);

    expect(result.structuredContent.items).toEqual([1, 2, 3]);
  });

  it("should handle null and undefined values", () => {
    const input = { nullValue: null, undefinedValue: undefined };
    const result = makeTextAndStructured(input);

    expect(result.structuredContent.nullValue).toBeNull();
  });
});
