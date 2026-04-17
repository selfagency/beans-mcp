import { describe, expect, it } from 'vitest';
import { createDistPackage } from '../../scripts/lib/dist-package.js';
import {
  buildTokenUserConfig,
  extractAuthTokenFromNpmrc,
  getRegistryAuthKey,
  resolveNpmPublishAuthCandidates,
  resolveNpmPublishAuth,
} from '../../scripts/lib/npm-auth.js';
import {
  buildRollbackPlan,
  DEFAULT_NPM_OTP_1PASSWORD_ITEM,
  getReleaseMetadataFiles,
  resolveOtpItemId,
} from '../../scripts/lib/release-state.js';

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

  it('returns auth candidates in precedence order for fallback attempts', () => {
    const candidates = resolveNpmPublishAuthCandidates({
      env: { NPM_TOKEN: 'env-token', NODE_AUTH_TOKEN: 'node-token' },
      registry: 'https://registry.npmjs.org',
      userConfigContent: '//registry.npmjs.org/:_authToken=file-token\n',
    });

    expect(candidates.map(candidate => candidate.source)).toEqual([
      'NPM_TOKEN',
      'NODE_AUTH_TOKEN',
      'NPM_CONFIG_USERCONFIG',
    ]);
  });

  it('deduplicates auth candidates when tokens are identical', () => {
    const candidates = resolveNpmPublishAuthCandidates({
      env: { NPM_TOKEN: 'same-token', NODE_AUTH_TOKEN: 'same-token' },
      registry: 'https://registry.npmjs.org',
      userConfigContent: '//registry.npmjs.org/:_authToken=same-token\n',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source).toBe('NPM_TOKEN');
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

describe('release state helpers', () => {
  it('includes server.json in release metadata files', () => {
    expect(getReleaseMetadataFiles()).toEqual(['package.json', 'server.json', 'CHANGELOG.md']);
  });

  it('has no built-in 1Password item default', () => {
    expect(DEFAULT_NPM_OTP_1PASSWORD_ITEM).toBe('');
    expect(resolveOtpItemId({})).toBe('');
  });

  it('prefers explicit env overrides for the OTP item', () => {
    expect(resolveOtpItemId({ DEFAULT_NPM_OTP_1PASSWORD_ITEM: 'fallback-item' })).toBe('fallback-item');
    expect(
      resolveOtpItemId({ NPM_OTP_1PASSWORD_ITEM: 'release-item', DEFAULT_NPM_OTP_1PASSWORD_ITEM: 'fallback-item' }),
    ).toBe('release-item');
  });

  it('builds rollback actions for publish failures after GitHub release creation', () => {
    expect(
      buildRollbackPlan({
        commitLocal: false,
        commitPushed: true,
        tagPushed: true,
        githubReleaseCreated: true,
        releaseDone: false,
      }),
    ).toEqual({
      deleteGitHubRelease: true,
      deleteTag: true,
      revertCommit: true,
      resetLocalCommit: false,
    });
  });

  it('does not roll back once the full release completed', () => {
    expect(
      buildRollbackPlan({
        commitLocal: false,
        commitPushed: true,
        tagPushed: true,
        githubReleaseCreated: true,
        releaseDone: true,
      }),
    ).toEqual({
      deleteGitHubRelease: false,
      deleteTag: false,
      revertCommit: false,
      resetLocalCommit: false,
    });
  });
});
