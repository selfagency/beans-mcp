# MCP Resources

## Agent discovery endpoints

The documentation site publishes the following discovery artifacts at `https://beans-mcp.self.agency`:

- `/robots.txt`
- `/server.json`
- `/status.json`
- `/.well-known/api-catalog`
- `/.well-known/mcp/server-card.json`
- `/.well-known/agent-skills/index.json`
- `/.well-known/agent-skills/beans-mcp/SKILL.md`

These files give agents a machine-readable way to find the public docs, the packaged MCP server descriptor, the server card, and the bundled skill.

## Static hosting limitations

The site is deployed as a static VitePress build on GitHub Pages.

That means the repository can publish static discovery files and HTML `<link>` hints, but it cannot guarantee two HTTP-level features by itself:

- **Response `Link` headers** on the homepage or well-known endpoints
- **Markdown content negotiation** for `Accept: text/markdown`

Those features require origin or edge control such as Cloudflare Workers, Transform Rules, or another host that can set response headers and vary content by request headers.

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
