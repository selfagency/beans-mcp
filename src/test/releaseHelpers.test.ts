import { describe, expect, it } from 'vitest';
import {
  buildTokenUserConfig,
  extractAuthTokenFromNpmrc,
  getRegistryAuthKey,
  resolveNpmPublishAuth,
} from '../../scripts/lib/npm-auth.js';
import { createDistPackage } from '../../scripts/lib/dist-package.js';

describe('npm auth helpers', () => {
  it('prefers NPM_TOKEN over npmrc auth', () => {
    const result = resolveNpmPublishAuth({
      env: { NPM_TOKEN: 'env-token' },
      registry: 'https://registry.npmjs.org',
      userConfigContent: '//registry.npmjs.org/:_authToken=file-token\n',
    });

    expect(result).toEqual({
      token: 'env-token',
      source: 'NPM_TOKEN',
      registry: 'https://registry.npmjs.org/',
    });
  });

  it('extracts the registry auth token from npmrc content', () => {
    const registry = 'https://registry.npmjs.org/';
    const npmrc = ['email=user@example.com', `${getRegistryAuthKey(registry)}=secret-token`].join('\n');

    expect(extractAuthTokenFromNpmrc(npmrc, registry)).toBe('secret-token');
  });

  it('builds a minimal userconfig for token publish auth', () => {
    expect(buildTokenUserConfig({ registry: 'https://registry.npmjs.org', token: 'secret-token' })).toBe(
      [
        'registry=https://registry.npmjs.org/',
        '//registry.npmjs.org/:_authToken=secret-token',
        'always-auth=true',
        '',
      ].join('\n'),
    );
  });
});

describe('createDistPackage', () => {
  it('creates publish metadata without path-cleaning warnings', () => {
    const distPkg = createDistPackage({
      name: '@selfagency/beans-mcp',
      version: '0.5.3',
      description: 'Beans MCP',
      keywords: ['beans'],
      homepage: 'https://github.com/selfagency/beans-mcp',
      bugs: { url: 'https://github.com/selfagency/beans-mcp/issues' },
      issues: undefined,
      repository: { type: 'git', url: 'git+https://github.com/selfagency/beans-mcp.git' },
      license: 'MIT',
      author: { name: 'Daniel' },
      mcpName: 'io.github.selfagency/beans-mcp',
    });

    expect(distPkg.bin).toEqual({ 'beans-mcp': 'beans-mcp-server.cjs' });
    expect(distPkg.files).toEqual(['index.cjs', 'index.js', 'index.d.ts', 'beans-mcp-server.cjs']);
  });
});
