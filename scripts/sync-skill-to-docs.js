#!/usr/bin/env node
/**
 * Copies skills/beans-mcp/ → docs/public/.well-known/agent-skills/beans-mcp/
 * so the published discovery artifact always reflects the source-of-truth skill.
 * Runs automatically before `docs:build` and `docs:dev`.
 */

import { cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(ROOT, 'skills/beans-mcp');
const dest = resolve(ROOT, 'docs/public/.well-known/agent-skills/beans-mcp');

await cp(src, dest, { recursive: true });
console.log('✅ Synced skills/beans-mcp → docs/public/.well-known/agent-skills/beans-mcp');
