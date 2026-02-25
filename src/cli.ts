/**
 * CLI entry point for beans-mcp-server
 *
 * Usage:
 *   beans-mcp-server /path/to/workspace [--cli-path beans] [--port 39173]
 */

import { startBeansMcpServer } from './server/BeansMcpServer';

// Works in both ESM and CJS
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule) {
  startBeansMcpServer(process.argv.slice(2)).catch((error) => {
    console.error('[beans-mcp-server] fatal:', error);
    process.exit(1);
  });
}
