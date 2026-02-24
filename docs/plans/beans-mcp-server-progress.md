# MCP Server Extraction - Implementation Progress

## Completed
✅ Package structure scaffolded at `/Users/daniel/Developer/beans-vscode/packages/beans-mcp-server/`
✅ package.json with tsup, MCP SDK, zod dependencies
✅ tsconfig.json configured for ES2022
✅ tsup.config.ts (replaces esbuild.js) with:
  - ESM entry (dist/index.js)
  - CJS entry (dist/index.cjs)
  - CLI entry (dist/beans-mcp-server.cjs with #!/usr/bin/env node shebang)
✅ vitest.config.ts configured (globals: false, node environment)
✅ src/types.ts - BeanRecord, GraphQLError, SortMode, constants
✅ src/utils.ts - isPathWithinRoot, makeTextAndStructured
✅ src/internal/graphql.ts - GraphQL queries/mutations
✅ src/server/backend.ts - BeansCliBackend class + BackendInterface
✅ src/internal/queryHelpers.ts - sortBeansInternal, handleQueryOperation
✅ src/server/BeansMcpServer.ts - registerTools, createBeansMcpServer, parseCliArgs, startBeansMcpServer

## Still Need to Create
- [ ] src/index.ts - Public API exports
- [ ] src/cli.ts - CLI entry point  
- [ ] src/test/ - Unit tests
- [ ] LICENSE, CONTRIBUTING.md
- [ ] Test build and verify outputs

## Key Implementation Details
- Uses tsup for bundling (replaces esbuild)
- MCP tools registered: beans_vscode_init, _view, _create, _edit, _reopen, _update, _delete, _query, _bean_file, _output
- Backend interface allows custom implementations
- Supports both programmatic API and CLI mode
- parseCliArgs handles: --workspace, --workspace-root (positional), --cli-path, --port, --log-dir

## Next Steps
1. Create src/index.ts with all public exports
2. Create src/cli.ts with process.main guard
3. Create basic tests
4. Test build: pnpm install && pnpm build
5. Verify dist/ outputs and types
