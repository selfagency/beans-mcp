# @selfagency/beans-mcp 🫘

[![Test & Build](https://github.com/selfagency/beans-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/selfagency/beans-mcp/actions/workflows/test.yml) [![codecov](https://codecov.io/gh/selfagency/beans-mcp/graph/badge.svg?token=udeAJyu8Nu)](https://codecov.io/gh/selfagency/beans-mcp)

MCP (Model Context Protocol) server for [Beans](https://github.com/hmans/beans) issue tracker. Provides programmatic and CLI interfaces for AI-powered interactions with Beans workspaces.

> 🤖 **Try Beans fully-integrated with GitHub Copilot in VS Code! Install the <a href="https://marketplace.visualstudio.com/items?itemName=selfagency.beans-vscode">selfagency.beans-vscode</a> extension.**

## Usage

```bash
npx @selfagency/beans-mcp /path/to/workspace
```

### Parameters

- `--workspace-root` or positional arg: Workspace root path
- `--cli-path`: Path to Beans CLI
- `--port`: MCP server port (default: 39173)
- `--log-dir`: Log directory
- `-h`, `--help`: Print usage and exit

## Summary of public MCP tools

- `beans_init` — Initialize the workspace (optional `prefix`).
- `beans_view` — Fetch full bean details by `beanId`.
- `beans_create` — Create a new bean (title/type + optional fields).
- `beans_update` — Consolidated metadata updates (status/type/priority/parent/clearParent/blocking/blockedBy).
- `beans_delete` — Delete a bean (`beanId`, optional `force`).
- `beans_reopen` — Reopen a completed or scrapped bean to an active status.
- `beans_query` — Unified list/search/filter/sort/llm_context/open_config operations.
- `beans_bean_file` — Read/edit/create/delete files under `.beans`.
- `beans_output` — Read extension output logs or show guidance.

### Notes

- The `beans_query` tool is intentionally broad: prefer it for listing, searching, filtering or sorting beans, and for generating Copilot instructions (`operation: 'llm_context'`).
- All file and log operations validate paths to keep them within the workspace or the VS Code log directory.
- `beans_update` replaces many fine-grained update tools; callers should use it to keep the public tool surface small and predictable.

## Examples

### beans_init

Request:

```json
{ "prefix": "project" }
```

Response (structuredContent):

```json
{ "initialized": true }
```

### beans_view

Request:

```json
{ "beanId": "bean-abc" }
```

Response (structuredContent):

```json
{
  "bean": {
    "id": "bean-abc",
    "title": "Fix login timeout",
    "status": "todo",
    "type": "bug",
    "priority": "critical",
    "body": "...markdown...",
    "createdAt": "2025-12-01T12:00:00Z",
    "updatedAt": "2025-12-02T08:00:00Z"
  }
}
```

### beans_create

Request:

```json
{
  "title": "Add dark mode",
  "type": "feature",
  "status": "todo",
  "priority": "normal",
  "description": "Implement theme toggle and styles"
}
```

Response (structuredContent):

```json
{
  "bean": {
    "id": "new-1",
    "title": "Add dark mode",
    "status": "todo",
    "type": "feature"
  }
}
```

### beans_update

Request (change status and add blocking):

```json
{
  "beanId": "bean-abc",
  "status": "in-progress",
  "blocking": ["bean-def"]
}
```

Response (structuredContent):

```json
{
  "bean": {
    "id": "bean-abc",
    "status": "in-progress",
    "blockingIds": ["bean-def"]
  }
}
```

### beans_delete

Request:

```json
{ "beanId": "bean-old", "force": false }
```

Response:

```json
{ "deleted": true, "beanId": "bean-old" }
```

### beans_reopen

Request:

```json
{
  "beanId": "bean-closed",
  "requiredCurrentStatus": "completed",
  "targetStatus": "todo"
}
```

Response:

```json
{ "bean": { "id": "bean-closed", "status": "todo" } }
```

### beans_query — examples

Refresh (list all beans):

```json
{ "operation": "refresh" }
```

Response (partial):

```json
{ "count": 12, "beans": [] }
```

Filter (statuses/types/tags):

```json
{
  "operation": "filter",
  "statuses": ["in-progress", "todo"],
  "types": ["bug", "feature"],
  "tags": ["auth"]
}
```

Search (full-text):

```json
{ "operation": "search", "search": "authentication", "includeClosed": false }
```

Sort (modes: `status-priority-type-title`, `updated`, `created`, `id`):

```json
{ "operation": "sort", "mode": "updated" }
```

LLM context (generate Copilot instructions; optional write-to-workspace):

```json
{ "operation": "llm_context", "writeToWorkspaceInstructions": true }
```

Response (structuredContent):

```json
{
  "graphqlSchema": "...",
  "generatedInstructions": "...",
  "instructionsPath": "/workspace/.github/instructions/tasks.instructions.md"
}
```

### beans_bean_file

Request (read):

```json
{ "operation": "read", "path": "beans-vscode-123--title.md" }
```

Response:

```json
{
  "path": "/workspace/.beans/beans-vscode-123--title.md",
  "content": "---\n...frontmatter...\n---\n# Title\n"
}
```

### beans_output

Request (read last 200 lines):

```json
{ "operation": "read", "lines": 200 }
```

Response:

```json
{
  "path": "/workspace/.vscode/logs/beans-output.log",
  "content": "...log lines...",
  "linesReturned": 200
}
```

## Programmatic usage

### Installation

```bash
npm install beans-mcp
```

### Example

```typescript
import { createBeansMcpServer, parseCliArgs } from "@selfagency/beans-mcp";

const server = await createBeansMcpServer({
  workspaceRoot: "/path/to/workspace",
  cliPath: "beans", // or path to beans CLI
});

// Connect to stdio transport or your own transport
```

### API

#### createBeansMcpServer(opts)

Creates and initializes a Beans MCP server instance.

**Options:**

- `workspaceRoot` (string): Path to the Beans workspace
- `cliPath` (string, optional): Path to Beans CLI executable (default: 'beans')
- `name` (string, optional): Server name (default: 'beans-mcp-server')
- `version` (string, optional): Server version
- `logDir` (string, optional): Directory for server logs
- `backend` (BackendInterface, optional): Custom backend implementation

**Returns:** `{ server: McpServer; backend: BackendInterface }`

#### startBeansMcpServer(argv)

CLI-compatible entrypoint for launching the server.

### Utility Functions

- `parseCliArgs(argv: string[])`: Parse CLI arguments
- `isPathWithinRoot(root: string, target: string): boolean`: Check if path is contained within root
- `sortBeans(beans, mode)`: Sort beans by specified mode

### Types & Schemas

Export of GraphQL schema, Zod validation schemas, and TypeScript types for Beans records and operations.

## License

MIT
