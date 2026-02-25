/**
 * CLI entry point for beans-mcp-server
 *
 * Usage:
 *   beans-mcp-server [workspace-root] [options]
 *   beans-mcp-server --help
 */

import { startBeansMcpServer } from './server/BeansMcpServer';

startBeansMcpServer(process.argv.slice(2)).catch(error => {
  console.error('[beans-mcp-server] fatal:', error);
  process.exit(1);
});
