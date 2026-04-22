# MCP Resources

## Agent discovery endpoints

The documentation site publishes the following discovery artifacts at `https://beans-mcp.self.agency`:

- `/robots.txt`
- `/server.json`
- `/status.json`
- `/.well-known/api-catalog`
- `/.well-known/mcp.json`
- `/.well-known/mcp/server-card.json`
- `/.well-known/openid-configuration`
- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/.well-known/jwks.json`
- `/.well-known/http-message-signatures-directory`
- `/.well-known/agent-skills/index.json`
- `/.well-known/agent-skills/beans-mcp/SKILL.md`

These files give agents a machine-readable way to find the public docs, the packaged MCP server descriptor, the server card, and the bundled skill.

## Static hosting limitations

The site is deployed as a static VitePress build on GitHub Pages.

That means the repository can publish static discovery files and HTML `<link>` hints, but it cannot guarantee two HTTP-level features by itself:

- **Response `Link` headers** on the homepage or well-known endpoints
- **Markdown content negotiation** for `Accept: text/markdown`

Those features require origin or edge control (for example, host-level response header configuration or a reverse proxy) that can set response headers and vary content by request headers.

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

## MCP Registry publishing documentation

The MCP Registry is a public, open, and searchable database of MCP servers and services. It provides a way for agents to discover and learn about available MCP servers and services.

The MCP Registry is hosted and maintained by the MCP community. It is not affiliated with any specific company or organization.

The MCP Registry is available at: <https://mcp-registry.self.agency>

The MCP Registry publishes discovery artifacts at:

- `/robots.txt`
- `/server.json`
- `/status.json`
- `/.well-known/api-catalog`
- `/.well-known/mcp.json`
- `/.well-known/mcp/server-card.json`
- `/.well-known/openid-configuration`
- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/.well-known/jwks.json`
- `/.well-known/http-message-signatures-directory`
- `/.well-known/agent-skills/index.json`
- `/.well-known/agent-skills/beans-mcp/SKILL.md`

These files give agents a machine-readable way to find the public docs, the packaged MCP server descriptor, the server card, and the bundled skill.
