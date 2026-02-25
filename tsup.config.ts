import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // ESM library entry point
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist',
    target: 'node18',
    dts: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    clean: true,
  },
  {
    // CJS library entry point
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs' }),
    target: 'node18',
    splitting: false,
    cjsInterop: true,
    dts: false,
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  {
    // CLI binary entry point
    entry: { 'beans-mcp-server': 'src/cli.ts' },
    format: ['cjs'],
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs' }),
    target: 'node18',
    splitting: false,
    cjsInterop: true,
    dts: false,
    sourcemap: process.env.NODE_ENV !== 'production',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
