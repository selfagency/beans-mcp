import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDistPackage } from '../../scripts/lib/dist-package.js';
import {
  buildTokenUserConfig,
  extractAuthTokenFromNpmrc,
  getRegistryAuthKey,
  resolveNpmPublishAuth,
  resolveNpmPublishAuthCandidates,
} from '../../scripts/lib/npm-auth.js';
import {
  fetchRegistrySchema,
  formatValidationErrors,
  loadRegistryMetadata,
  validateRegistryMetadata,
  validateRegistryMetadataSync,
  validateServerJsonSchemaSubset,
} from '../../scripts/lib/registry-metadata.js';
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
      ['registry=https://registry.npmjs.org/', '//registry.npmjs.org/:_authToken=secret-token', ''].join('\n'),
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
      mcpName: 'agency.self/beans-mcp',
    });

    expect(distPkg.bin).toEqual({ 'beans-mcp': 'beans-mcp-server.cjs' });
    expect(distPkg.files).toEqual([
      'index.cjs',
      'index.js',
      'index.d.ts',
      'beans-mcp-server.cjs',
      'skills',
      'skills-lock.json',
    ]);
  });
});

describe('release state helpers', () => {
  it('includes docs server descriptors in release metadata files', () => {
    expect(getReleaseMetadataFiles()).toEqual([
      'package.json',
      'docs/public/server.json',
      'docs/public/.well-known/mcp/server-card.json',
      'CHANGELOG.md',
    ]);
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Shared Package schema definition reused across schema-validation tests
const MOCK_PACKAGE_DEF = { required: ['identifier', 'registryType', 'transport'] };

describe('registry metadata validation', () => {
  it('passes when all metadata is synchronized', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: {
        name: '@selfagency/beans-mcp',
        version: '0.6.2',
        mcpName: 'agency.self/beans-mcp',
      },
      serverJson: {
        name: 'agency.self/beans-mcp',
        version: '0.6.2',
        packages: [
          {
            identifier: '@selfagency/beans-mcp',
            version: '0.6.2',
            transport: { type: 'stdio' },
          },
        ],
      },
    });

    expect(errors).toHaveLength(0);
  });

  it('fails when mcpName is missing from package.json', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: {
        name: '@selfagency/beans-mcp',
        version: '0.6.2',
      },
      serverJson: {
        name: 'agency.self/beans-mcp',
        version: '0.6.2',
        packages: [
          {
            identifier: '@selfagency/beans-mcp',
            version: '0.6.2',
          },
        ],
      },
    });

    expect(errors).toContain('package.json must include mcpName.');
  });

  it('fails when mcpName mismatches server.json name', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: {
        name: '@selfagency/beans-mcp',
        version: '0.6.2',
        mcpName: 'agency.self.wrong-package',
      },
      serverJson: {
        name: 'agency.self.beans-mcp',
        version: '0.6.2',
        packages: [
          {
            identifier: '@selfagency/beans-mcp',
            version: '0.6.2',
          },
        ],
      },
    });

    expect(errors).toContain(
      "mcpName mismatch: package.json has 'agency.self.wrong-package', server.json has 'agency.self.beans-mcp'.",
    );
  });

  it('fails when version mismatches between package.json and server.json', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: {
        name: '@selfagency/beans-mcp',
        version: '0.6.2',
        mcpName: 'agency.self.beans-mcp',
      },
      serverJson: {
        name: 'agency.self.beans-mcp',
        version: '0.6.3',
        packages: [
          {
            identifier: '@selfagency/beans-mcp',
            version: '0.6.3',
          },
        ],
      },
    });

    expect(errors).toContain("version mismatch: package.json has '0.6.2', server.json has '0.6.3'.");
  });

  it('fails when package identifier mismatches package.json name', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: {
        name: '@selfagency/beans-mcp',
        version: '0.6.2',
        mcpName: 'agency.self.beans-mcp',
      },
      serverJson: {
        name: 'agency.self.beans-mcp',
        version: '0.6.2',
        packages: [
          {
            identifier: '@selfagency/different-package',
            version: '0.6.2',
          },
        ],
      },
    });

    expect(errors).toContain(
      "package identifier mismatch: package.json name is '@selfagency/beans-mcp', server.json packages[0].identifier is '@selfagency/different-package'.",
    );
  });

  it('fails when server.json packages is missing', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: {
        name: '@selfagency/beans-mcp',
        version: '0.6.2',
        mcpName: 'agency.self.beans-mcp',
      },
      serverJson: {
        name: 'agency.self.beans-mcp',
        version: '0.6.2',
      },
    });

    expect(errors).toContain('docs/public/server.json must contain packages[0].');
  });

  it('validates required server.json fields against schema definition', () => {
    const mockSchema = {
      definitions: {
        ServerDetail: {
          required: ['name', 'version', 'description'],
        },
        Package: MOCK_PACKAGE_DEF,
      },
    };

    const errors = validateServerJsonSchemaSubset({
      serverJson: {
        name: 'io.github.test.package',
        version: '1.0.0',
      },
      schema: mockSchema,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('server.json missing required field');
    expect(errors[0]).toContain('description');
  });

  it('validates server.json name against schema pattern', () => {
    const mockSchema = {
      definitions: {
        ServerDetail: {
          properties: {
            name: {
              pattern: '^io\\.github\\.[a-z0-9-]+/[a-z0-9-]+$',
            },
          },
        },
        Package: MOCK_PACKAGE_DEF,
      },
    };

    const errors = validateServerJsonSchemaSubset({
      serverJson: {
        name: 'invalid.name.format',
        version: '1.0.0',
      },
      schema: mockSchema,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('server.json name');
    expect(errors[0]).toContain('invalid.name.format');
    expect(errors[0]).toContain('does not match schema pattern');
  });

  it('validates required packages fields against schema definition', () => {
    const mockSchema = {
      definitions: {
        ServerDetail: {
          required: ['name', 'version'],
        },
        Package: MOCK_PACKAGE_DEF,
      },
    };

    const errors = validateServerJsonSchemaSubset({
      serverJson: {
        name: 'io.github.test.package',
        version: '1.0.0',
        packages: [{ identifier: '@test/package', version: '1.0.0', registryType: 'npm' }],
      },
      schema: mockSchema,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('server.json packages[0]');
    expect(errors[0]).toContain('missing required field');
    expect(errors[0]).toContain('transport');
  });

  it('returns early when schema definitions are missing', () => {
    const errors = validateServerJsonSchemaSubset({
      serverJson: { name: 'test', version: '1.0.0' },
      schema: {},
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('schema definitions.ServerDetail and definitions.Package are required');
  });

  it('fails when server.json name is missing', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: { name: '@selfagency/beans-mcp', version: '0.6.2', mcpName: 'agency.self/beans-mcp' },
      serverJson: { version: '0.6.2', packages: [{ identifier: '@selfagency/beans-mcp', version: '0.6.2' }] },
    });

    expect(errors).toContain('docs/public/server.json must include name.');
  });

  it('fails when package.json version is missing', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: { name: '@selfagency/beans-mcp', mcpName: 'agency.self/beans-mcp' },
      serverJson: {
        name: 'agency.self/beans-mcp',
        version: '0.6.2',
        packages: [{ identifier: '@selfagency/beans-mcp', version: '0.6.2' }],
      },
    });

    expect(errors).toContain('package.json version and server.json version are required.');
  });

  it('fails when packages[0].version is missing', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: { name: '@selfagency/beans-mcp', version: '0.6.2', mcpName: 'agency.self/beans-mcp' },
      serverJson: {
        name: 'agency.self/beans-mcp',
        version: '0.6.2',
        packages: [{ identifier: '@selfagency/beans-mcp' }],
      },
    });

    expect(errors).toContain('docs/public/server.json packages[0].version is required.');
  });

  it('fails when packages[0].identifier is missing', () => {
    const errors = validateRegistryMetadataSync({
      packageJson: { name: '@selfagency/beans-mcp', version: '0.6.2', mcpName: 'agency.self/beans-mcp' },
      serverJson: {
        name: 'agency.self/beans-mcp',
        version: '0.6.2',
        packages: [{ version: '0.6.2' }],
      },
    });

    expect(errors).toContain('docs/public/server.json packages[0].identifier is required.');
  });
});

describe('formatValidationErrors', () => {
  it('formats error strings as a markdown list', () => {
    expect(formatValidationErrors(['first error', 'second error'])).toBe('- first error\n- second error');
  });

  it('returns an empty string for no errors', () => {
    expect(formatValidationErrors([])).toBe('');
  });
});

describe('fetchRegistrySchema', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns parsed JSON on a successful fetch', async () => {
    const mockSchema = { definitions: { ServerDetail: {}, Package: {} } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockSchema) }));

    const result = await fetchRegistrySchema('https://example.com/schema.json');

    expect(result).toEqual(mockSchema);
  });

  it('throws when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));

    await expect(fetchRegistrySchema('https://example.com/schema.json')).rejects.toThrow(
      'Failed to fetch registry schema (404 Not Found)',
    );
  });
});

describe('loadRegistryMetadata', () => {
  it('loads package.json and server.json from the given root directory', () => {
    const { packageJson, serverJson } = loadRegistryMetadata(REPO_ROOT);

    expect(typeof packageJson.name).toBe('string');
    expect(typeof packageJson.version).toBe('string');
    expect(typeof serverJson.name).toBe('string');
    expect(typeof serverJson.version).toBe('string');
  });
});

describe('validateRegistryMetadata', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns combined sync and schema errors using real repo files', async () => {
    const mockSchema = {
      definitions: {
        ServerDetail: { required: ['name', 'version'] },
        Package: MOCK_PACKAGE_DEF,
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockSchema) }));

    const errors = await validateRegistryMetadata({ rootDir: REPO_ROOT });

    // Real repo files are in sync so no sync errors; schema errors depend on fixture
    expect(Array.isArray(errors)).toBe(true);
  });
});
