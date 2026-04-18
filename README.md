# @selfagency/beans-mcp 🫘

<img src="docs/assets/icon.png" alt="beans-mcp icon" width="300" />

[![Test & Build](https://github.com/selfagency/beans-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/selfagency/beans-mcp/actions/workflows/test.yml) [![codecov](https://codecov.io/gh/selfagency/beans-mcp/graph/badge.svg?token=udeAJyu8Nu)](https://codecov.io/gh/selfagency/beans-mcp) ![NPM Version](https://img.shields.io/npm/v/@selfagency/beans-mcp)

MCP (Model Context Protocol) server for [Beans](https://github.com/hmans/beans) issue tracker. Provides programmatic and CLI interfaces for AI-powered interactions with Beans workspaces.

Documentation: [beans-mcp.self.agency](https://beans-mcp.self.agency)

> 🤖 **Try Beans fully-integrated with GitHub Copilot in VS Code! Install the <a href="https://marketplace.visualstudio.com/items?itemName=selfagency.beans-vscode">selfagency.beans-vscode</a> extension.**

## Usage

```bash
npx @selfagency/beans-mcp /path/to/workspace
```

### Versioning

`@selfagency/beans-mcp` tracks upstream [Beans](https://github.com/hmans/beans) versions.
For example, Beans `v0.4.2` maps to `@selfagency/beans-mcp@0.4.2`.

At startup, the server compares its own package version against the installed `beans`
CLI version. If they differ, it prints a warning to stderr and continues startup.

### Parameters

- `--workspace-root` or positional arg: Workspace root path
- `--cli-path`: Path to Beans CLI
- `--port`: MCP server port (default: 39173)
- `--log-dir`: Log directory
- `-h`, `--help`: Print usage and exit

## Summary of public MCP tools

| Tool                   | Description                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beans_init`           | Initialize the workspace (optional `prefix`).                                                                                                                                        |
| `beans_archive`        | Archive completed/scrapped beans.                                                                                                                                                    |
| `beans_view`           | Fetch full bean details by `beanId` or `beanIds`.                                                                                                                                    |
| `beans_create`         | Create a new bean (title/type + optional body/parent).                                                                                                                               |
| `beans_bulk_create`    | Create multiple beans in one call, optionally under a shared parent.                                                                                                                 |
| `beans_update`         | Consolidated metadata + body updates (status/type/priority/parent/clearParent/blocking/blockedBy/body/bodyAppend/bodyReplace) plus optional optimistic concurrency hint (`ifMatch`). |
| `beans_bulk_update`    | Update multiple beans in one call, optionally reassigning them to a shared parent.                                                                                                   |
| `beans_complete_tasks` | Mark all markdown checklist tasks within a bean as complete.                                                                                                                         |
| `beans_delete`         | Delete one or many beans (`beanId` or `beanIds`, optional `force`).                                                                                                                  |
| `beans_reopen`         | Reopen a completed or scrapped bean to an active status.                                                                                                                             |
| `beans_query`          | Unified list/search/filter/sort/ready operations, with GraphQL passthrough.                                                                                                          |
| `beans_bean_file`      | Read/edit/create/delete files under `.beans`.                                                                                                                                        |
| `beans_output`         | Read extension output logs or show guidance.                                                                                                                                         |

<details>
<summary>Notes</summary>

- The `beans_query` tool is intentionally broad: prefer it for listing, searching, filtering or sorting beans, and for generating Copilot instructions (`operation: 'llm_context'`).
- All file and log operations validate paths to keep them within the workspace or the VS Code log directory. The `.beans/` prefix is automatically stripped from paths — you can pass either `some-bean.md` or `.beans/some-bean.md` and the result is the same.
- `beans_update` replaces many fine-grained update tools; callers should use it to keep the public tool surface small and predictable.
- `beans_archive` provides CLI parity for archiving completed/scrapped beans.
- Closing a parent bean via `beans_update` (`status: completed` or `status: scrapped`) cascades the same status to all descendants.
- Reopening a parent bean via `beans_reopen` cascades the target status to closed descendants (`completed` / `scrapped`).
- `beans_bulk_create` and `beans_bulk_update` are best-effort: they process each item sequentially and return a per-item result array with success/error entries rather than failing atomically.
- Frontmatter `title:` values are automatically double-quoted on write. Pass raw titles — quoting and escaping is handled for you.
- `beans_bean_file` supports `update_frontmatter` for atomic frontmatter-only writes; supported fields include `pr` and `branch`.
- Unfiltered list results are cached with a short burst TTL and a timestamp-probe refresh strategy. Mutation tools (`beans_create`, `beans_update`, `beans_delete`, etc.) invalidate the cache immediately.
- Version mismatches between `beans-mcp` and the Beans CLI are warning-only and non-blocking by design.
- When `beanId` is missing in tool input, validation errors include a hint: `Did you mean \`beanId\`?`.

</details>

## Examples

<details>
<summary>beans_init</summary>

Request:

```json
{ "prefix": "project" }
```

Response (structuredContent):

```json
{ "initialized": true }
```

</details>

<details>
<summary>beans_view</summary>

Request:

```json
{ "beanId": "bean-abc" }
```

Request (multiple beans):

```json
{ "beanIds": ["bean-abc", "bean-def"] }
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

</details>

<details>
<summary>beans_archive</summary>

Request:

```json
{}
```

Response (example):

```json
{ "archived": true, "archivedCount": 3 }
```

</details>

<details>
<summary>beans_create</summary>

Request:

```json
{
  "title": "Add dark mode",
  "type": "feature",
  "status": "todo",
  "priority": "normal",
  "body": "Implement theme toggle and styles",
  "parent": "epic-123"
}
```

> `description` is accepted as a deprecated alias for `body`.

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

</details>

<details>
<summary>beans_bulk_create</summary>

Request:

```json
{
  "parent": "epic-123",
  "beans": [
    { "title": "Design mockups", "type": "task" },
    { "title": "Implement API", "type": "task", "priority": "high" },
    { "title": "Write tests", "type": "task", "parent": "epic-456" }
  ]
}
```

The top-level `parent` is applied as a default to any bean that does not specify its own `parent`. Here `Design mockups` and `Implement API` are assigned to `epic-123`; `Write tests` overrides with `epic-456`.

Response (structuredContent):

```json
{
  "requestedCount": 3,
  "successCount": 3,
  "failedCount": 0,
  "results": [
    { "bean": { "id": "task-1", "title": "Design mockups" } },
    { "bean": { "id": "task-2", "title": "Implement API" } },
    { "bean": { "id": "task-3", "title": "Write tests" } }
  ]
}
```

</details>

<details>
<summary>beans_bulk_update</summary>

Request (move a batch of tasks to in-progress and assign them to a parent):

```json
{
  "parent": "epic-123",
  "beans": [
    { "beanId": "task-1", "status": "in-progress" },
    { "beanId": "task-2", "status": "in-progress" },
    { "beanId": "task-3", "status": "in-progress", "parent": "epic-456" }
  ]
}
```

Response (structuredContent):

```json
{
  "requestedCount": 3,
  "successCount": 3,
  "failedCount": 0,
  "results": [
    { "beanId": "task-1", "bean": { "id": "task-1", "status": "in-progress" } },
    { "beanId": "task-2", "bean": { "id": "task-2", "status": "in-progress" } },
    { "beanId": "task-3", "bean": { "id": "task-3", "status": "in-progress" } }
  ]
}
```

> Both bulk tools are best-effort: partial failures are reported per-item rather than aborting the whole batch.

</details>

<details>
<summary>beans_update</summary>

Request (change status and add blocking):

```json
{
  "beanId": "bean-abc",
  "status": "in-progress",
  "blocking": ["bean-def"],
  "ifMatch": "etag-value"
}
```

Request (atomic body modifications):

```json
{
  "beanId": "bean-abc",
  "bodyReplace": [
    { "old": "- [ ] Task 1", "new": "- [x] Task 1" },
    { "old": "- [ ] Task 2", "new": "- [x] Task 2" }
  ],
  "bodyAppend": "## Summary\n\nAll checklist items completed."
}
```

> Note: `body` (full replacement) cannot be combined with `bodyAppend` or `bodyReplace` in the same request.

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

</details>

<details>
<summary>beans_delete</summary>

Request:

```json
{ "beanId": "bean-old", "force": false }
```

Response:

```json
{ "deleted": true, "beanId": "bean-old" }
```

Batch request:

```json
{ "beanIds": ["bean-old", "bean-older"], "force": false }
```

Batch response (summary):

```json
{
  "requestedCount": 2,
  "deletedCount": 2,
  "failedCount": 0,
  "results": [
    { "beanId": "bean-old", "deleted": true },
    { "beanId": "bean-older", "deleted": true }
  ]
}
```

</details>

<details>
<summary>beans_reopen</summary>

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

</details>

<details>
<summary>beans_complete_tasks</summary>

Request:

```json
{ "beanId": "bean-abc" }
```

Response:

```json
{
  "bean": {
    "id": "bean-abc",
    "status": "todo"
  },
  "totalTaskCount": 5,
  "updatedTaskCount": 3,
  "unchangedTaskCount": 2
}
```

</details>

<details>
<summary>beans_query examples</summary>

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

Ready (actionable beans only):

```json
{ "operation": "ready" }
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
  "instructionsPath": "/workspace/.github/instructions/beans-prime.instructions.md"
}
```

Raw GraphQL passthrough (CLI parity with `beans query`):

```json
{
  "operation": "graphql",
  "graphql": "{ beans(filter: { type: [\"bug\"] }) { id title status } }"
}
```

With variables:

```json
{
  "operation": "graphql",
  "graphql": "query($q: String!) { beans(filter: { search: $q }) { id title } }",
  "variables": { "q": "authentication" }
}
```

</details>

<details>
<summary>beans_bean_file</summary>

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

Request (atomic frontmatter update):

```json
{
  "operation": "update_frontmatter",
  "path": "beans-vscode-123--title.md",
  "fields": {
    "status": "in-progress",
    "pr": "123",
    "branch": "feature/cascade-status-and-skills-npm"
  }
}
```

Response:

```json
{
  "path": "/workspace/.beans/beans-vscode-123--title.md",
  "bytes": 256,
  "updatedFields": ["status", "pr", "branch"],
  "frontmatter": {
    "status": "in-progress",
    "pr": "123",
    "branch": "feature/cascade-status-and-skills-npm"
  }
}
```

</details>

<details>
<summary>beans_output</summary>

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

</details>

## Programmatic usage

### Installation

```bash
npm install beans-mcp
```

### Example

```typescript
import { createBeansMcpServer, parseCliArgs } from '@selfagency/beans-mcp';

const server = await createBeansMcpServer({
  workspaceRoot: '/path/to/workspace',
  cliPath: 'beans', // or path to beans CLI
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

## Agent Skills (`skills-npm`, `skills.sh`)

This package ships a built-in Agent Skill under `skills/` and also publishes that skill in a format that fits the broader open skills ecosystem surfaced by [skills.sh](https://skills.sh/).

- Skill path in package: `skills/beans-mcp/SKILL.md`
- Published skill artifact: `https://beans-mcp.self.agency/.well-known/agent-skills/beans-mcp/SKILL.md`
- Published discovery index: `https://beans-mcp.self.agency/.well-known/agent-skills/index.json`
- Compatible with discovery tools that scan: `node_modules/**/skills/*/SKILL.md`

That means you can use it with npm-based workflows such as `skills-npm`, while also pointing ecosystem tooling at the published skill artifact and discovery index used by skills catalogs like `skills.sh`.

To symlink installed npm-packaged skills into your agent workspace, you can use `skills-npm` in your consuming project.

## License

MIT
