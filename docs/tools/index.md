# Tool Reference Overview

`beans-mcp` exposes a compact, high-signal MCP tool surface for Beans workflows.

## Tool groups

### Workspace and query

- `beans_init`
- `beans_archive`
- `beans_view`
- `beans_query`
- `beans_output`

### Lifecycle mutations

- `beans_create`
- `beans_edit`
- `beans_update`
- `beans_reopen`
- `beans_complete_tasks`
- `beans_delete`

### Bulk operations

- `beans_bulk_create`
- `beans_bulk_update`

### File operations

- `beans_bean_file` (`read`, `edit`, `create`, `delete`, `update_frontmatter`)

## Validation style

All tools use Zod schemas for argument validation and return consistent MCP text/structured responses.
