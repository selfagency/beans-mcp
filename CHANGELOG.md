# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.2] - 2026-04-18

## What's Changed
* Fix Beans CLI compatibility checks by @selfagency in https://github.com/selfagency/beans-mcp/pull/11


**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.6.1...v0.6.2

_Source: changes from v0.6.1 to v0.6.2._


### Changed

- Startup compatibility checks now compare the installed `beans` CLI version
  against the hardcoded supported Beans version (`0.4.2`) instead of the
  `@selfagency/beans-mcp` package version.
- README and configuration docs now describe package versioning and Beans CLI
  compatibility separately.

## [0.6.1] - 2026-04-18

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.6.0...v0.6.1

_Source: changes from v0.6.0 to v0.6.1._

## [0.6.0] - 2026-04-18

## What's Changed

- chore(deps): bump vite from 8.0.3 to 8.0.5 in the npm_and_yarn group across 1 directory by @dependabot[bot] in https://github.com/selfagency/beans-mcp/pull/7
- chore(deps-dev): bump the npm_and_yarn group across 1 directory with 2 updates by @dependabot[bot] in https://github.com/selfagency/beans-mcp/pull/8
- fix: harden CLI parsing and backend safety by @selfagency in https://github.com/selfagency/beans-mcp/pull/10
- chore(deps-dev): bump hono from 4.12.12 to 4.12.14 in the npm_and_yarn group across 1 directory by @dependabot[bot] in https://github.com/selfagency/beans-mcp/pull/9

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.5.0...v0.6.0

_Source: changes from v0.5.0 to v0.6.0._

## [0.5.2] - 2026-04-06

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.5.1...v0.5.2

_Source: changes from v0.5.1 to v0.5.2._

## [0.5.1] - 2026-04-06

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.5.0...v0.5.1

_Source: changes from v0.5.0 to v0.5.1._

## [0.5.0] - 2026-04-06

## What's Changed

- chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates by @dependabot[bot] in https://github.com/selfagency/beans-mcp/pull/2
- chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates by @dependabot[bot] in https://github.com/selfagency/beans-mcp/pull/4
- feat: bulk create/update, body on create, path stripping, frontmatter quoting, list caching by @selfagency in https://github.com/selfagency/beans-mcp/pull/5

## New Contributors

- @dependabot[bot] made their first contribution in https://github.com/selfagency/beans-mcp/pull/2

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.4.2...v0.5.0

_Source: changes from v0.4.2 to v0.5.0._

## [0.4.2] - 2026-03-13

## What's Changed

- feat: align MCP server with Beans 0.4.x + prime workflow by @selfagency in https://github.com/selfagency/beans-mcp/pull/3

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.1.4...v0.4.2

_Source: changes from v0.1.4 to v0.4.2._

### Changed

- Versioning policy now tracks upstream Beans versions (e.g. Beans `0.4.2` ↔ `@selfagency/beans-mcp@0.4.2`).
- MCP server metadata version now defaults to package version instead of a hardcoded fallback.

### Added

- Startup version compatibility warning: the server compares `beans` CLI version with `@selfagency/beans-mcp` version and warns on mismatch.
- Version probe failures are warning-only; startup continues in best-effort mode.
- `beans_query` now supports `operation: "ready"` to return actionable beans.
- `beans_view` now supports multi-ID lookups via `beanIds`.
- `beans_delete` now supports batch deletion via `beanIds` with per-item summary results.
- `beans_update` now accepts optional `ifMatch` and forwards optimistic-concurrency intent where supported.
- `beans_update` now supports atomic body modifications via `bodyReplace` and `bodyAppend`.
- `beans_query` `llm_context` now returns live `beans prime` instructions and can write them to `.github/instructions/beans-prime.instructions.md`.

## [0.1.4] - 2026-02-27

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.1.3...v0.1.4

_Source: changes from v0.1.3 to v0.1.4._

## [0.1.3] - 2026-02-27

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.1.2...v0.1.3

_Source: changes from v0.1.2 to v0.1.3._

## [0.1.2] - 2026-02-27

## What's Changed

- feat: support body updates and de-duplicate MCP results by @selfagency in https://github.com/selfagency/beans-mcp/pull/1

## New Contributors

- @selfagency made their first contribution in https://github.com/selfagency/beans-mcp/pull/1

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.1.1...v0.1.2

_Source: changes from v0.1.1 to v0.1.2._

## [0.1.1] - 2026-02-25

**Full Changelog**: https://github.com/selfagency/beans-mcp/compare/v0.1.0...v0.1.1

_Source: changes from v0.1.0 to v0.1.1._

## [0.1.0] - 2026-02-25

**Full Changelog**: https://github.com/selfagency/beans-mcp/commits/v0.1.0

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
