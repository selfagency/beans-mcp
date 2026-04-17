# Configuration

## Environment variables

- `BEANS_MCP_PORT`: default server port
- `BEANS_VSCODE_MCP_PORT`: VS Code override port
- `BEANS_VSCODE_OUTPUT_LOG`: output log path override
- `BEANS_VSCODE_LOG_DIR`: permitted log directory override

## Version compatibility behavior

At startup, `beans-mcp` probes `beans version` and compares CLI version with package version.

- Mismatch is warning-only (startup continues)
- Warning is written to stderr only (stdout preserved for MCP transport)

## Logging behavior

- Startup banner and warnings go to stderr
- Tool payloads are returned as MCP text/structured output

## Packaging

Published package includes:

- `dist/` runtime build
- `skills/` bundled Agent Skills content
- `README.md` and `LICENSE.txt`
