#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_SCHEMA_URL,
    fetchRegistrySchema,
    formatValidationErrors,
    loadRegistryMetadata,
    validateRegistryMetadataSync,
    validateServerJsonSchemaSubset,
} from './lib/registry-metadata.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const args = process.argv.slice(2);
  const skipSchema = args.includes('--skip-schema');
  const rootDir = process.env.ROOT_DIR || ROOT;

  try {
    console.log('Validating MCP registry metadata...\n');

    const { packageJson, serverJson } = loadRegistryMetadata(rootDir);

    // Sync validation (no network)
    const syncErrors = validateRegistryMetadataSync({ packageJson, serverJson });

    if (syncErrors.length > 0) {
      console.error('❌ Synchronization errors found:');
      console.error(formatValidationErrors(syncErrors));
      console.error('\nFix these errors before publishing to MCP registry.');
      process.exit(1);
    }

    console.log('✅ Metadata synchronization check passed');

    // Schema validation (requires network)
    if (!skipSchema) {
      console.log('Fetching and validating against MCP registry schema...');
      const schema = await fetchRegistrySchema(DEFAULT_SCHEMA_URL);
      const schemaErrors = validateServerJsonSchemaSubset({ serverJson, schema });

      if (schemaErrors.length > 0) {
        console.error('❌ Schema validation errors found:');
        console.error(formatValidationErrors(schemaErrors));
        console.error(`\nFix these errors before publishing to MCP registry.`);
        console.error(`Use --skip-schema to skip schema validation (not recommended).`);
        process.exit(1);
      }

      console.log('✅ Schema validation passed');
    } else {
      console.log('⚠️  Schema validation skipped (--skip-schema flag)');
    }

    console.log('\n✅ All registry metadata validation checks passed!');
  } catch (error) {
    console.error('\n❌ Validation failed with error:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

void main();
