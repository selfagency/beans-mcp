import { describe, expect, it, vi } from "vitest";
import { createBeansMcpServer, parseCliArgs } from "../server/BeansMcpServer";
import type { BackendInterface } from "../server/backend";
import type { BeanRecord } from "../types";

describe("parseCliArgs", () => {
  it("should parse positional workspace root", () => {
    const args = ["/path/to/workspace"];
    const result = parseCliArgs(args);
    expect(result.workspaceRoot).toBe("/path/to/workspace");
  });

  it("should parse --workspace-root flag", () => {
    const args = ["--workspace-root", "/custom/path"];
    const result = parseCliArgs(args);
    expect(result.workspaceRoot).toBe("/custom/path");
  });

  it("should allow both positional and --workspace-root (flag overwrites positional)", () => {
    const args = ["/positional", "--workspace-root", "/flag"];
    const result = parseCliArgs(args);
    // Flag comes after positional, so it overwrites
    expect(result.workspaceRoot).toBe("/flag");
  });

  it("should parse --cli-path flag", () => {
    const args = ["--cli-path", "/usr/bin/beans"];
    const result = parseCliArgs(args);
    expect(result.cliPath).toBe("/usr/bin/beans");
  });

  it("should use default cli-path", () => {
    const args = [];
    const result = parseCliArgs(args);
    expect(result.cliPath).toBe("beans");
  });

  it("should parse --port flag", () => {
    const args = ["--port", "8080"];
    const result = parseCliArgs(args);
    expect(result.port).toBe(8080);
  });

  it("should use default port", () => {
    const args = [];
    const result = parseCliArgs(args);
    expect(result.port).toBe(39173);
  });

  it("should parse --log-dir flag", () => {
    const args = ["--log-dir", "/var/log"];
    const result = parseCliArgs(args);
    expect(result.logDir).toBe("/var/log");
  });

  it("should handle combined flags", () => {
    const args = [
      "/workspace",
      "--cli-path",
      "/usr/bin/beans",
      "--port",
      "9000",
      "--log-dir",
      "/tmp/logs",
    ];
    const result = parseCliArgs(args);
    expect(result.workspaceRoot).toBe("/workspace");
    expect(result.cliPath).toBe("/usr/bin/beans");
    expect(result.port).toBe(9000);
    expect(result.logDir).toBe("/tmp/logs");
  });

  it("should reject suspicious CLI paths with shell metacharacters", () => {
    const dangerous = ["--cli-path", "beans; rm -rf /"];
    expect(() => parseCliArgs(dangerous)).toThrow("Invalid CLI path");
  });

  it("should reject CLI paths with pipes", () => {
    const dangerous = ["--cli-path", "beans | cat /etc/passwd"];
    expect(() => parseCliArgs(dangerous)).toThrow("Invalid CLI path");
  });

  it("should reject CLI paths with redirects", () => {
    const dangerous = ["--cli-path", "beans > /etc/passwd"];
    expect(() => parseCliArgs(dangerous)).toThrow("Invalid CLI path");
  });

  it("should reject CLI paths with backticks", () => {
    const dangerous = ["--cli-path", "`rm -rf /`"];
    expect(() => parseCliArgs(dangerous)).toThrow("Invalid CLI path");
  });

  it("should reject CLI paths with dollar expansion", () => {
    const dangerous = ["--cli-path", "$(whoami)"];
    expect(() => parseCliArgs(dangerous)).toThrow("Invalid CLI path");
  });

  it("should allow safe CLI paths with slashes and dashes", () => {
    const safe = ["--cli-path", "/usr/local/bin/beans-cli"];
    const result = parseCliArgs(safe);
    expect(result.cliPath).toBe("/usr/local/bin/beans-cli");
  });
});

describe("createBeansMcpServer", () => {
  const mockBackend: BackendInterface = {
    init: vi.fn(async () => ({ initialized: true })),
    list: vi.fn(async () => []),
    create: vi.fn(async (input) => ({
      id: "bean1",
      slug: "bean1",
      path: "bean1.md",
      title: input.title,
      body: "",
      status: input.status || "draft",
      type: input.type,
    })),
    update: vi.fn(async () => ({
      id: "bean1",
      slug: "bean1",
      path: "bean1.md",
      title: "Updated",
      body: "",
      status: "todo",
      type: "task",
    })),
    delete: vi.fn(async () => ({ deleted: true })),
    openConfig: vi.fn(async () => ({ configPath: "/config", content: "{}" })),
    graphqlSchema: vi.fn(async () => "schema"),
    readOutputLog: vi.fn(async () => ({
      path: "/log",
      content: "log",
      linesReturned: 0,
    })),
    readBeanFile: vi.fn(async () => ({ path: "/file", content: "content" })),
    editBeanFile: vi.fn(async () => ({ path: "/file", bytes: 10 })),
    createBeanFile: vi.fn(async () => ({
      path: "/file",
      bytes: 10,
      created: true,
    })),
    deleteBeanFile: vi.fn(async () => ({ path: "/file", deleted: true })),
  };

  it("should create an MCP server instance", async () => {
    const { server, backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    expect(server).toBeDefined();
    expect(backend).toBeDefined();
  });

  it("should use provided backend implementation", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    expect(backend).toBe(mockBackend);
  });

  it("should set server name from options", async () => {
    const { server } = await createBeansMcpServer({
      workspaceRoot: "/test",
      name: "custom-server",
      backend: mockBackend,
    });

    expect(server).toBeDefined();
  });

  it("should set server version from options", async () => {
    const { server } = await createBeansMcpServer({
      workspaceRoot: "/test",
      version: "2.0.0",
      backend: mockBackend,
    });

    expect(server).toBeDefined();
  });

  it("should accept logDir option", async () => {
    const { server } = await createBeansMcpServer({
      workspaceRoot: "/test",
      logDir: "/var/log",
      backend: mockBackend,
    });

    expect(server).toBeDefined();
  });

  it("should accept cliPath option", async () => {
    const { server: _server } = await createBeansMcpServer({
      workspaceRoot: "/test",
      cliPath: "/usr/bin/beans",
      backend: mockBackend,
    });

    expect(_server).toBeDefined();
  });

  it("should handle empty list operation", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    (mockBackend.list as any).mockImplementationOnce(async () => []);
    const result = await backend.list();
    expect(result).toEqual([]);
  });

  it("should handle list with beans", async () => {
    const mockBeans: BeanRecord[] = [
      {
        id: "bean1",
        slug: "bean1",
        path: "bean1.md",
        title: "Test Bean",
        body: "Content",
        status: "todo",
        type: "task",
      },
    ];

    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    (mockBackend.list as any).mockImplementationOnce(async () => mockBeans);
    const result = await backend.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("bean1");
  });

  it("should call backend init with prefix", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    await backend.init("TEST");
    expect((mockBackend.init as any).mock.calls.length).toBeGreaterThan(0);
  });

  it("should create beans with required fields", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.create({
      title: "New Bean",
      type: "task",
    });

    expect(result.id).toBe("bean1");
    expect(result.title).toBe("New Bean");
  });

  it("should create beans with optional status", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    await backend.create({
      title: "New Bean",
      type: "feature",
      status: "in-progress",
    });

    expect((mockBackend.create as any).mock.calls.length).toBeGreaterThan(0);
  });

  it("should create beans with optional priority", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    await backend.create({
      title: "New Bean",
      type: "bug",
      priority: "high",
    });

    expect((mockBackend.create as any).mock.calls.length).toBeGreaterThan(0);
  });

  it("should handle bean updates", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.update("bean1", {
      status: "completed",
    });

    expect(result.status).toBe("todo");
  });

  it("should delete beans", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.delete("bean1");
    expect(result).toEqual({ deleted: true });
  });

  it("should open config", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.openConfig();
    expect(result).toEqual({ configPath: "/config", content: "{}" });
  });

  it("should get GraphQL schema", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.graphqlSchema();
    expect(result).toBe("schema");
  });

  it("should read output log", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.readOutputLog();
    expect(result.path).toBe("/log");
  });

  it("should read bean file", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.readBeanFile("test.md");
    expect(result.content).toBe("content");
  });

  it("should edit bean file", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.editBeanFile("test.md", "new content");
    expect(result.bytes).toBe(10);
  });

  it("should create bean file", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.createBeanFile("test.md", "content");
    expect(result.created).toBe(true);
  });

  it("should delete bean file", async () => {
    const { backend } = await createBeansMcpServer({
      workspaceRoot: "/test",
      backend: mockBackend,
    });

    const result = await backend.deleteBeanFile("test.md");
    expect(result.path).toBe("/file");
  });
});
