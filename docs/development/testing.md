# Testing

The project uses Vitest with unit, integration-style, and protocol-level coverage.

## Suites

- Unit handlers: `src/test/handlers.unit.test.ts`
- Protocol e2e: `src/test/protocol.e2e.test.ts`
- Backend/file safety: `src/test/BeansMcpServer.test.ts`, `src/test/backend.frontmatter.test.ts`

## Run tests

```bash
pnpm test
```

Coverage:

```bash
pnpm test:coverage
```

## What to validate for tool changes

- Zod schema validation behavior
- error messaging and hinting
- mutation side effects (including cascades)
- response shape invariants
