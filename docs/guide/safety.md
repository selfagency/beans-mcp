# Safety & Permissions

## Path safety

Bean file operations are restricted to `.beans/` under workspace root.

- Leading `.beans/` prefixes are normalized
- Path traversal outside `.beans` is rejected

Output log reads are restricted to:

- Workspace tree, or
- Explicit VS Code log directory override

## Mutation safety

- `beans_delete` defaults to draft/scrapped-only unless `force: true`
- `beans_update` rejects invalid body field combinations
- `ifMatch` supports optimistic concurrency for updates

## Frontmatter safety

`update_frontmatter` performs atomic writes and preserves body content.

Supported frontmatter fields include:

- status/type/priority/title
- parent/blocking metadata
- `pr`, `branch`
