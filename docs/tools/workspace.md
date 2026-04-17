# Workspace & Query Tools

## `beans_init`

Initializes Beans in the current workspace.

Input:

- `prefix?` (max 32)

## `beans_archive`

Archives completed/scrapped beans.

Input: `{}`

## `beans_view`

Fetches one or many beans.

Inputs:

- `beanId`
- `beanIds[]`

## `beans_query`

Unified read/query operation.

`operation` values:

- `refresh`
- `filter`
- `search`
- `sort`
- `ready`
- `llm_context`
- `open_config`
- `graphql`

Common fields:

- `statuses[]`, `types[]`, `tags[]`
- `search`, `includeClosed`
- `mode` for sort

## `beans_output`

Reads output logs or returns guidance.

- `operation: read | show`
- `lines?` for bounded log reads
