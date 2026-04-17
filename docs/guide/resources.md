# MCP Resources

## Query-generated workspace instructions

Use `beans_query` with `operation: "llm_context"` to generate context for coding agents.

Optional behavior:

- `writeToWorkspaceInstructions: true` writes to:
  - `.github/instructions/beans-prime.instructions.md`

## GraphQL schema

Use `beans_query` with `operation: "llm_context"` or backend API to obtain current schema text.

## Bundled skill

The package ships Agent Skills content at:

- `skills/beans-mcp/SKILL.md`

This supports `skills-npm` style discovery patterns.
