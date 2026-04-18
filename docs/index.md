# beans-mcp

![beans-mcp icon](./assets/icon.svg)

Production-ready MCP server for the [Beans](https://github.com/hmans/beans) issue tracker.

## What you get

- Full tool coverage for workspace setup, bean lifecycle, querying, and file ops
- Safe path handling for `.beans` records and output logs
- Bulk operations and GraphQL passthrough for advanced automation
- Type-safe backend API for embedding into MCP hosts and tests

## Quick links

- [Getting Started](/guide/getting-started)
- [Tool Reference](/tools/)
- [Architecture](/development/architecture)

## Core MCP tools

- `beans_init`, `beans_archive`, `beans_view`
- `beans_create`, `beans_edit`, `beans_update`, `beans_reopen`, `beans_delete`
- `beans_bulk_create`, `beans_bulk_update`, `beans_complete_tasks`
- `beans_query`, `beans_bean_file`, `beans_output`

## Install

```bash
pnpm add @selfagency/beans-mcp
```

Or run directly:

```bash
npx @selfagency/beans-mcp /path/to/workspace
```
