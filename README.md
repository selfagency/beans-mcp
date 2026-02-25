# beans-mcp

MCP (Model Context Protocol) server for [Beans](https://github.com/hmans/beans) issue tracker. Provides programmatic and CLI interfaces for AI-powered interactions with Beans workspaces.

**Try Beans fully-integrated with GitHub Copilot in VS Code! Install the [selfagency.beans-vscode](https://marketplace.visualstudio.com/items?itemName=selfagency.beans-vscode) extension.**

## Usage

```bash
npx beans-mcp /path/to/workspace --cli-path beans --port 39173
```

## API

### createBeansMcpServer(opts)

Creates and initializes a Beans MCP server instance.

**Options:**

- `workspaceRoot` (string): Path to the Beans workspace
- `cliPath` (string, optional): Path to Beans CLI executable (default: 'beans')
- `name` (string, optional): Server name (default: 'beans-mcp')
- `version` (string, optional): Server version
- `logDir` (string, optional): Directory for server logs
- `allowedRoots` (string[], optional): Allowed file system roots
- `backend` (BackendInterface, optional): Custom backend implementation

**Returns:** `{ server: McpServer; backend: BackendInterface }`

### startBeansMcpServer(argv)

CLI-compatible entrypoint for launching the server.

**Options:**

- `--workspace-root` or positional arg: Workspace root path
- `--cli-path`: Path to Beans CLI
- `--port`: MCP server port (default: 39173)
- `--log-dir`: Log directory

### Utility Functions

- `parseCliArgs(argv: string[])`: Parse CLI arguments
- `isPathWithinRoot(root: string, target: string): boolean`: Check if path is contained within root
- `sortBeans(beans, mode)`: Sort beans by specified mode

### Types & Schemas

Export of GraphQL schema, Zod validation schemas, and TypeScript types for Beans records and operations.

## License

MIT
