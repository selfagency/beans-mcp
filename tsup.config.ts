import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // ESM entry point
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist',
    dts: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    clean: true,
  },
  {
    // CommonJS entry point
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs' }),
    dts: false,
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  {
    // CLI entry point (CommonJS with shebang)
    entry: { 'beans-mcp-server': 'src/cli.ts' },
    format: ['cjs'],
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs' }),
    dts: false,
    sourcemap: process.env.NODE_ENV !== 'production',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
