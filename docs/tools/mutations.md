# Mutation Tools

## `beans_create`

Creates a bean.

Key fields:

- `title`, `type` (required)
- `status`, `priority`
- `body` (or deprecated `description`)
- `parent`

## `beans_edit`

Metadata-only update helper.

Key fields:

- `beanId` (required)
- `status`, `type`, `priority`
- `parent`, `clearParent`
- `blocking[]`, `blockedBy[]`

## `beans_update`

Consolidated update tool.

Adds support for:

- body replacement (`body`)
- body append (`bodyAppend`)
- body replace operations (`bodyReplace[]`)
- optimistic concurrency (`ifMatch`)

Constraint:

- `body` cannot be combined with `bodyAppend`/`bodyReplace`

## `beans_reopen`

Reopens from `completed` or `scrapped` to target status.

- Validates `requiredCurrentStatus`
- Supports descendant reopen cascade for closed descendants

## `beans_complete_tasks`

Marks markdown checklist items complete in bean body.

## `beans_delete`

Deletes one or many beans.

Safety:

- default allows only draft/scrapped unless `force: true`
