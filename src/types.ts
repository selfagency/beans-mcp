/**
 * Public types for beans-mcp-server
 */

export type SortMode = 'status-priority-type-title' | 'updated' | 'created' | 'id';

export type BeanRecord = {
  id: string;
  slug: string;
  path: string;
  title: string;
  body: string;
  status: string;
  type: string;
  priority?: string;
  tags?: string[];
  parentId?: string;
  blockingIds?: string[];
  blockedByIds?: string[];
  createdAt?: string;
  updatedAt?: string;
  etag?: string;
};

/**
 * GraphQL error shape as returned by the Beans CLI GraphQL endpoint.
 */
export type GraphQLError = {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
};

export const DEFAULT_MCP_PORT = 39173;

export const MAX_ID_LENGTH = 128;
export const MAX_TITLE_LENGTH = 1024;
export const MAX_METADATA_LENGTH = 128;
export const MAX_DESCRIPTION_LENGTH = 65536; // 64KB
export const MAX_PATH_LENGTH = 1024;
