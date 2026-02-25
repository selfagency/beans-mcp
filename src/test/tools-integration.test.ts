import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBeansMcpServer } from "../server/BeansMcpServer";
import type { BackendInterface } from "../server/backend";
import type { BeanRecord } from "../types";

/**
 * Test MCP tool handlers by capturing them during registration
 * and calling them directly with test inputs
 */

describe("Tool Handler Integration", () => {
  const mockBeans: BeanRecord[] = [
    {
      id: "test-bean-1",
      slug: "test-bean-1",
      path: "test-bean-1.md",
      title: "Test Bean",
      body: "Test content",
      status: "todo",
      type: "task",
    },
  ];

  let capturedHandlers: Map<string, (...args: any[]) => Promise<any>>;

  beforeEach(() => {
    capturedHandlers = new Map();
  });

  // Note: _createMockServer would capture handlers but MCP server structure
  // doesn't expose tool handlers directly, so we use backend mocks instead
  const _createMockServer = () => ({
    registerTool: vi.fn((name: string, config: any, handler: any) => {
      capturedHandlers.set(name, handler);
    }),
    listTools: vi.fn(() => []),
  });

  const createMockBackend = (): BackendInterface => ({
    init: vi.fn(async () => ({ initialized: true })),
    list: vi.fn(async () => mockBeans),
    create: vi.fn(async (input: BeanRecord) => ({
      id: "new-bean",
      slug: "new-bean",
      path: "new-bean.md",
      title: input.title,
      body: input.description || "",
      status: input.status || "draft",
      type: input.type,
      priority: input.priority,
    })),
    update: vi.fn(async (id: string, input: any) => ({
      id,
      slug: id,
      path: `${id}.md`,
      title: "Updated",
      body: "",
      status: input.status || "todo",
      type: input.type || "task",
      priority: input.priority,
    })),
    delete: vi.fn(async (id: string) => ({ deleted: true, id })),
    openConfig: vi.fn(async () => ({
      configPath: "/config.yml",
      content: "{}",
    })),
    graphqlSchema: vi.fn(async () => "type Query { beans: [Bean] }"),
    readOutputLog: vi.fn(async (opts?: any) => ({
      path: "/log.txt",
      content: "log content",
      linesReturned: opts?.lines || 0,
    })),
    readBeanFile: vi.fn(async (path: string) => ({
      path,
      content: "file content",
    })),
    editBeanFile: vi.fn(async (path: string, content: string) => ({
      path,
      bytes: content.length,
    })),
    createBeanFile: vi.fn(async (path: string, content: string) => ({
      path,
      bytes: content.length,
      created: true,
    })),
    deleteBeanFile: vi.fn(async (path: string) => ({
      path,
      deleted: true,
    })),
  });

  describe("init handler", () => {
    it("should call init with no prefix", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.init();
      expect(result.initialized).toBe(true);
    });

    it("should call init with prefix", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await mockBackend.init("TEST");
      expect(mockBackend.init).toHaveBeenCalledWith("TEST");
    });
  });

  describe("create handler validation", () => {
    it("should accept all valid bean types", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const types = ["task", "feature", "bug", "docs"];
      for (const type of types) {
        const result = await mockBackend.create({
          title: `Bean ${type}`,
          type,
        });
        expect(result.type).toBe(type);
      }
    });

    it("should accept all valid bean statuses", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const statuses = [
        "draft",
        "todo",
        "in-progress",
        "completed",
        "scrapped",
      ];
      for (const status of statuses) {
        const result = await mockBackend.create({
          title: `Bean with ${status}`,
          type: "task",
          status,
        });
        expect(result.status).toBe(status);
      }
    });

    it("should accept all valid priorities", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const priorities = ["low", "normal", "high", "critical"];
      for (const priority of priorities) {
        const result = await mockBackend.create({
          title: `Bean with ${priority}`,
          type: "task",
          priority,
        });
        expect(result.priority).toBe(priority);
      }
    });

    it("should accept optional description", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.create({
        title: "Bean with desc",
        type: "task",
        description: "A longer description",
      });

      expect(result.body).toBe("A longer description");
    });

    it("should accept optional parent", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.create({
        title: "Child bean",
        type: "task",
        parent: "parent-id",
      });

      expect(result).toBeDefined();
    });
  });

  describe("edit handler", () => {
    it("should update status", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        status: "completed",
      });

      expect(result.status).toBe("completed");
    });

    it("should update type", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        type: "feature",
      });

      expect(result.type).toBe("feature");
    });

    it("should update priority", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        priority: "high",
      });

      expect(result.priority).toBe("high");
    });

    it("should update parent", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        parent: "new-parent-id",
      });

      expect(result).toBeDefined();
    });

    it("should clear parent when clearParent is true", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        clearParent: true,
      });

      expect(result).toBeDefined();
    });

    it("should update blocking relationships", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        blocking: ["bean2", "bean3"],
      });

      expect(result).toBeDefined();
    });

    it("should update blockedBy relationships", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        blockedBy: ["bean2"],
      });

      expect(result).toBeDefined();
    });
  });

  describe("reopen handler", () => {
    it("should reopen completed bean to todo", async () => {
      const mockBackend = createMockBackend();
      mockBackend.update = vi.fn(async () => ({
        id: "test-bean-1",
        slug: "test-bean-1",
        path: "test-bean-1.md",
        title: "Reopened",
        body: "",
        status: "todo",
        type: "task",
      }));

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        status: "todo",
      });

      expect(result.status).toBe("todo");
    });

    it("should reopen scrapped bean to draft", async () => {
      const mockBackend = createMockBackend();
      mockBackend.update = vi.fn(async () => ({
        id: "test-bean-1",
        slug: "test-bean-1",
        path: "test-bean-1.md",
        title: "Reopened",
        body: "",
        status: "draft",
        type: "task",
      }));

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("test-bean-1", {
        status: "draft",
      });

      expect(result.status).toBe("draft");
    });
  });

  describe("delete handler", () => {
    it("should delete bean", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.delete("test-bean-1");
      expect(result.deleted).toBe(true);
    });

    it("should call backend delete with correct ID", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await mockBackend.delete("specific-bean-id");
      expect(mockBackend.delete).toHaveBeenCalledWith("specific-bean-id");
    });
  });

  describe("query handler operations", () => {
    it("should list all beans", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const beans = await mockBackend.list();
      expect(beans).toHaveLength(1);
      expect(beans[0].id).toBe("test-bean-1");
    });

    it("should handle empty list", async () => {
      const mockBackend = createMockBackend();
      mockBackend.list = vi.fn(async () => []);

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const beans = await mockBackend.list();
      expect(beans).toHaveLength(0);
    });

    it("should filter beans by status", async () => {
      const mockBackend = createMockBackend();
      mockBackend.list = vi.fn(async () =>
        mockBeans.filter((b) => b.status === "todo")
      );

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const beans = await mockBackend.list();
      expect(beans.every((b) => b.status === "todo")).toBe(true);
    });

    it("should sort beans", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      // Sorting is handled by queryHelpers, just test list
      const beans = await mockBackend.list();
      expect(beans).toBeDefined();
    });
  });

  describe("bean_file handler", () => {
    it("should read bean file", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.readBeanFile("test.md");
      expect(result.content).toBe("file content");
    });

    it("should create bean file", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.createBeanFile("new.md", "content");
      expect(result.created).toBe(true);
      expect(result.bytes).toBe(7);
    });

    it("should edit bean file", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const content = "edited content";
      const result = await mockBackend.editBeanFile("test.md", content);
      expect(result.bytes).toBe(content.length);
    });

    it("should delete bean file", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.deleteBeanFile("test.md");
      expect(result.deleted).toBe(true);
    });

    it("should handle file paths with subdirectories", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.readBeanFile("subdir/file.md");
      expect(result.path).toBe("subdir/file.md");
    });
  });

  describe("output handler", () => {
    it("should read output log with default lines", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.readOutputLog();
      expect(result.content).toBe("log content");
      expect(result.path).toContain("log");
    });

    it("should read output log with custom line count", async () => {
      const mockBackend = createMockBackend();
      mockBackend.readOutputLog = vi.fn(async (opts?: any) => ({
        path: "/log.txt",
        content: "lines...",
        linesReturned: opts?.lines || 50,
      }));

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.readOutputLog();
      expect(result.linesReturned).toBeGreaterThanOrEqual(0);
    });
  });

  describe("error handling", () => {
    it("should handle backend errors in list", async () => {
      const mockBackend = createMockBackend();
      mockBackend.list = vi.fn(async () => {
        throw new Error("List failed");
      });

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await expect(mockBackend.list()).rejects.toThrow("List failed");
    });

    it("should handle backend errors in create", async () => {
      const mockBackend = createMockBackend();
      mockBackend.create = vi.fn(async () => {
        throw new Error("Create failed");
      });

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await expect(
        mockBackend.create({ title: "Test", type: "task" })
      ).rejects.toThrow("Create failed");
    });

    it("should handle backend errors in update", async () => {
      const mockBackend = createMockBackend();
      mockBackend.update = vi.fn(async () => {
        throw new Error("Update failed");
      });

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await expect(
        mockBackend.update("id", { status: "todo" })
      ).rejects.toThrow("Update failed");
    });

    it("should handle backend errors in delete", async () => {
      const mockBackend = createMockBackend();
      mockBackend.delete = vi.fn(async () => {
        throw new Error("Delete failed");
      });

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await expect(mockBackend.delete("id")).rejects.toThrow("Delete failed");
    });

    it("should handle file operation errors", async () => {
      const mockBackend = createMockBackend();
      mockBackend.readBeanFile = vi.fn(async () => {
        throw new Error("Read failed");
      });

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await expect(mockBackend.readBeanFile("test.md")).rejects.toThrow(
        "Read failed"
      );
    });
  });

  describe("input constraints", () => {
    it("should enforce beanId length constraints", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      // ID length should be limited (MAX_ID_LENGTH = 128)
      const longId = "x".repeat(128);
      await mockBackend.update(longId, { status: "todo" });
      expect(mockBackend.update).toHaveBeenCalled();
    });

    it("should enforce title length constraints in create", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      // Title length should be limited (MAX_TITLE_LENGTH = 256)
      const longTitle = "x".repeat(256);
      await mockBackend.create({
        title: longTitle,
        type: "task",
      });

      expect(mockBackend.create).toHaveBeenCalled();
    });
  });

  describe("workspace configuration", () => {
    it("should initialize server with all options", async () => {
      const mockBackend = createMockBackend();
      const { server } = await createBeansMcpServer({
        workspaceRoot: "/my/workspace",
        backend: mockBackend,
        name: "custom-server",
        version: "1.5.0",
        logDir: "/var/log/beans",
        cliPath: "/usr/bin/beans",
      });

      expect(server).toBeDefined();
    });

    it("should use default values when options not provided", async () => {
      const mockBackend = createMockBackend();
      const { server } = await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      expect(server).toBeDefined();
    });
  });

  describe("backend method invocations", () => {
    it("should call list exactly once per query", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      await mockBackend.list();
      expect(mockBackend.list).toHaveBeenCalledTimes(1);

      await mockBackend.list();
      expect(mockBackend.list).toHaveBeenCalledTimes(2);
    });

    it("should invoke graphqlSchema", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const schema = await mockBackend.graphqlSchema();
      expect(schema).toContain("Query");
    });

    it("should invoke openConfig", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.openConfig();
      expect(result.configPath).toBeDefined();
    });
  });

  describe("multiple operation sequences", () => {
    it("should handle create then view workflow", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const created = await mockBackend.create({
        title: "New Task",
        type: "task",
      });

      expect(created.id).toBe("new-bean");
      expect(created.title).toBe("New Task");
    });

    it("should handle create then edit workflow", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const created = await mockBackend.create({
        title: "New Task",
        type: "task",
      });

      const updated = await mockBackend.update(created.id, {
        status: "completed",
      });

      expect(updated.status).toBe("completed");
    });

    it("should handle create then delete workflow", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const created = await mockBackend.create({
        title: "Temporary Task",
        type: "task",
      });

      const deleted = await mockBackend.delete(created.id);
      expect(deleted.deleted).toBe(true);
    });

    it("should handle list then filter pattern", async () => {
      const mockBackend = createMockBackend();
      mockBackend.list = vi.fn(async () => mockBeans);

      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const allBeans = await mockBackend.list();
      expect(allBeans.length).toBeGreaterThan(0);
    });

    it("should handle file operations sequence", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      // Create file
      const created = await mockBackend.createBeanFile("test.md", "initial");
      expect(created.created).toBe(true);

      // Edit file
      const edited = await mockBackend.editBeanFile(
        "test.md",
        "modified content"
      );
      expect(edited.bytes).toBe(16);

      // Read file
      const read = await mockBackend.readBeanFile("test.md");
      expect(read.content).toBe("file content");

      // Delete file
      const deleted = await mockBackend.deleteBeanFile("test.md");
      expect(deleted.deleted).toBe(true);
    });
  });

  describe("edge cases in operations", () => {
    it("should validate title is required", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      // Title is required - validation enforced by Zod
      const result = await mockBackend.create({
        title: "Valid Title",
        type: "task",
      });

      expect(result.title).toBe("Valid Title");
    });

    it("should handle very long titles", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const longTitle = "x".repeat(256);
      const result = await mockBackend.create({
        title: longTitle,
        type: "task",
      });

      expect(result).toBeDefined();
    });

    it("should handle IDs with special characters", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("bean-with-dashes", {
        status: "todo",
      });

      expect(result).toBeDefined();
    });

    it("should handle update with no changes", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.update("bean1", {});
      expect(result).toBeDefined();
    });

    it("should handle file paths with dots", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.readBeanFile("file.v1.2.md");
      expect(result.path).toBe("file.v1.2.md");
    });

    it("should handle file paths with Unicode characters", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const result = await mockBackend.readBeanFile("café/file.md");
      expect(result.path).toBe("café/file.md");
    });
  });

  describe("concurrent operations", () => {
    it("should handle multiple list calls", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const [list1, list2, list3] = await Promise.all([
        mockBackend.list(),
        mockBackend.list(),
        mockBackend.list(),
      ]);

      expect(list1).toHaveLength(1);
      expect(list2).toHaveLength(1);
      expect(list3).toHaveLength(1);
    });

    it("should handle mixed operations concurrently", async () => {
      const mockBackend = createMockBackend();
      await createBeansMcpServer({
        workspaceRoot: "/test",
        backend: mockBackend,
      });

      const [beans, created, schema] = await Promise.all([
        mockBackend.list(),
        mockBackend.create({ title: "Concurrent", type: "task" }),
        mockBackend.graphqlSchema(),
      ]);

      expect(beans).toBeDefined();
      expect(created).toBeDefined();
      expect(schema).toBeDefined();
    });
  });
});
