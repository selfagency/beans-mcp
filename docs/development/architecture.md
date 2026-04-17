# Architecture

## Layers

- `src/server/BeansMcpServer.ts`
  - Tool registration
  - Input schema validation
  - Handler orchestration
- `src/server/backend.ts`
  - Beans CLI adapter
  - GraphQL execution
  - cache and file safety logic
- `src/internal/queryHelpers.ts`
  - Query operation handling (`refresh/filter/search/sort/ready/llm_context`)
- `src/internal/graphql.ts`
  - Shared GraphQL query/mutation text

## Runtime flow

1. Parse CLI args
2. Initialize backend
3. Register MCP tools
4. Connect stdio transport
5. Optionally resolve workspace via MCP roots

## Caching

Unfiltered list calls use two-stage cache:

- burst TTL fast return
- timestamp probe to avoid full refetch when unchanged
