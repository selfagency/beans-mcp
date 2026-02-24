/**
 * Public API for beans-mcp-server
 *
 * Exports:
 * - createBeansMcpServer: Create an MCP server instance
 * - startBeansMcpServer: CLI entrypoint for launching as stdio server
 * - parseCliArgs: Parse CLI arguments for configuration
 * - isPathWithinRoot: Utility to validate file paths stay within root
 * - sortBeans: Sort beans by specified mode
 *
 * Types:
 * - BeanRecord, SortMode, GraphQLError
 * - BackendInterface: Interface for custom backend implementations
 */

export { createBeansMcpServer, parseCliArgs, startBeansMcpServer } from './server/BeansMcpServer';
export { BeansCliBackend, type BackendInterface } from './server/backend';
export { sortBeans } from './internal/queryHelpers';
export { isPathWithinRoot, makeTextAndStructured } from './utils';
export type { BeanRecord, SortMode, GraphQLError } from './types';
export { DEFAULT_MCP_PORT, MAX_ID_LENGTH, MAX_TITLE_LENGTH, MAX_METADATA_LENGTH } from './types';
