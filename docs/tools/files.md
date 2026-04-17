# Bean File Operations

## `beans_bean_file`

Single tool with operation selector:

- `read`
- `edit`
- `create`
- `delete`
- `update_frontmatter`

## Path semantics

- Paths are resolved under `.beans/`
- Leading `.beans/` is accepted and normalized
- Path traversal outside workspace bean root is blocked

## `update_frontmatter`

Atomic metadata update without rewriting body.

Supported fields:

- `title`, `status`, `type`, `priority`
- `parent_id`, `tags`
- `blocking_ids`, `blocked_by_ids`
- `pr`, `branch`

Nullable fields can be removed by setting them to `null`.

## Frontmatter normalization

- `title` is normalized to double-quoted YAML scalar
- Inline comments and YAML quoting edge cases are handled
