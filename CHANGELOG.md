# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-02-24

Initial public release. Extracted and substantially reworked from the
[selfagency.beans-vscode](https://marketplace.visualstudio.com/items?itemName=selfagency.beans-vscode)
VS Code extension's embedded MCP server into a standalone, independently
installable package.

### Added

#### MCP Tools

All 14 Beans MCP tools are implemented and registered:

- `beans_init` — Initialize the workspace (optional prefix).
- `beans_list` — List beans with filtering by status, type, tags, and search.
- `beans_view` — View a single bean by ID.
- `beans_create` — Create a new bean.
- `beans_update` / `beans_edit` — Update an existing bean (aliases).
- `beans_reopen` — Reopen a completed or scrapped bean.
- `beans_delete` — Delete a draft or scrapped bean.
- `beans_set_status` — Set a bean's status directly.
- `beans_query` — Run llm_context, refresh, and workspace-instructions operations.
- `beans_bean_file` — Read, edit, create, or delete raw bean markdown files.
- `beans_output` — Read the Beans CLI output log.
- `beans_open_config` — Return the workspace config file path and content.
- `beans_graphql_schema` — Return the Beans GraphQL schema.

#### Public API

- `createBeansMcpServer(opts)` — Programmatic factory for embedding a Beans
  MCP server in other applications; accepts an optional `backend` parameter
  for dependency injection.
- `startBeansMcpServer(argv)` — CLI entrypoint; launches the server with a
  `StdioServerTransport`.
- `parseCliArgs(argv)` — Parse and validate CLI arguments; returns a
  `workspaceExplicit` flag so callers can distinguish user-supplied roots from
  the cwd default.
- `BeansCliBackend` — Concrete backend that shells out to the `beans` CLI.
- `BackendInterface` — Interface for custom backend implementations.
- `MutableBackend` — Thin delegation wrapper whose inner backend can be
  hot-swapped after MCP roots discovery without re-registering tools.
- `resolveWorkspaceFromRoots(server)` — Queries the connected client's
  declared MCP roots and returns the first `file://` path as a local workspace
  path, or `null` if none are declared.
- `sortBeans`, `isPathWithinRoot`, `makeTextAndStructured` — Utility helpers.

#### Workspace Resolution

The server resolves its workspace in priority order:

1. `--workspace-root` / positional CLI argument (explicit)
2. MCP roots declared by the connected client (`roots/list`)
3. `process.cwd()` (fallback)

This enables using the server without CLI arguments: AI clients that declare
MCP roots (e.g. Cursor, Claude Desktop) automatically provide the workspace
path after connecting.

#### CLI

- `beans-mcp` binary accepts:
  - Positional or `--workspace-root` for the workspace path.
  - `--cli-path` — path to the `beans` executable (default: `beans`).
  - `--port` — MCP server port (default: 39173).
  - `--log-dir` — log directory (defaults to workspace root).
  - `-h` / `--help` — print usage and exit.

#### Build

- Multi-config `tsup.config.ts` produces three outputs:
  - ESM library (`dist/index.js` + `dist/index.d.ts`)
  - CJS library (`dist/index.cjs`)
  - CJS CLI binary (`dist/beans-mcp-server.cjs`) with `#!/usr/bin/env node` shebang
- All CJS configs use `target: 'node18'`, `splitting: false`, `cjsInterop: true`.
- `postbuild` script writes a trimmed `dist/package.json` with correct `bin`,
  `exports`, `main`, `module`, and `types` fields.

#### Tests

- **Protocol E2E tests** (`src/test/protocol.e2e.test.ts`) — 52 tests using
  `InMemoryTransport` + MCP `Client` to exercise the full JSON-RPC wire format,
  Zod input validation, backend error surfacing as `{ isError: true }` tool
  results, and the MCP roots protocol.
- **`startBeansMcpServer` integration tests** (`src/test/startBeansMcpServer.test.ts`)
  — mocked dynamic imports for `BeansCliBackend` and `StdioServerTransport`.
- Handler unit tests — exported handler factories tested in isolation.
- `MutableBackend` unit tests — delegation and `setInner` swap behaviour.
- `resolveWorkspaceFromRoots` unit tests — all branches (found, skipped,
  empty list, throws).
- `parseCliArgs` tests — `workspaceExplicit` flag, `--help`/`-h` output and
  exit code.
- Statement and function coverage: **100%** for `BeansMcpServer.ts`.

#### CI

- GitHub Actions workflow runs lint, type-check, build, and test on Node 18
  and 22 across Ubuntu and macOS.
- pnpm store cache keyed on lockfile hash with `~/.pnpm-store` fallback.

### Changed

- Tool IDs renamed to remove the `_vscode` suffix carried over from the
  extension (e.g. `beans_init_vscode` → `beans_init`).
- `--log-dir` now defaults to the workspace root when omitted.
- `cli.ts` simplified: removed the `isMainModule` guard; always invokes
  `startBeansMcpServer`.
- Bin command renamed from `beans-mcp-server` to `beans-mcp`.

### Fixed

- Build script was overriding `tsup.config.ts` with inline CLI flags, causing
  the CLI binary to never be produced. Fixed by setting `"build": "tsup"`.
- `package.json` exports paths corrected to include the `dist/` prefix.
- Eliminated all `any` types: `queryHandler` opts, `backend.ts` filter
  parameter, and `queryHelpers.ts` return type narrowed to
  `Record<string, unknown>`.
- README: corrected package import name (`@selfagency/beans-mcp`), server
  default name (`beans-mcp-server`), removed the non-existent `allowedRoots`
  option from the `createBeansMcpServer` docs.

[Unreleased]: https://github.com/selfagency/beans-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/selfagency/beans-mcp/releases/tag/v0.1.0
