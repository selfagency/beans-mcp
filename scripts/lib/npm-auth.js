import { URL } from 'node:url';

export function normalizeRegistry(registry) {
  const trimmed = (registry || 'https://registry.npmjs.org/').trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function getRegistryAuthKey(registry) {
  const normalized = normalizeRegistry(registry);
  const url = new URL(normalized);
  return `//${url.host}${url.pathname}:_authToken`;
}

export function extractAuthTokenFromNpmrc(npmrcContent, registry) {
  if (!npmrcContent) {
    return '';
  }

  const authKey = getRegistryAuthKey(registry);
  const lines = npmrcContent.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    if (line.startsWith(`${authKey}=`)) {
      return line.slice(authKey.length + 1).trim();
    }

    if (line.startsWith('_authToken=')) {
      return line.slice('_authToken='.length).trim();
    }
  }

  return '';
}

export function resolveNpmPublishAuth({ env, registry, userConfigContent }) {
  const normalizedRegistry = normalizeRegistry(registry);
  const envToken = env.NPM_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, source: 'NPM_TOKEN', registry: normalizedRegistry };
  }

  const nodeAuthToken = env.NODE_AUTH_TOKEN?.trim();
  if (nodeAuthToken) {
    return { token: nodeAuthToken, source: 'NODE_AUTH_TOKEN', registry: normalizedRegistry };
  }

  const npmrcToken = extractAuthTokenFromNpmrc(userConfigContent, normalizedRegistry);
  if (npmrcToken) {
    return { token: npmrcToken, source: 'NPM_CONFIG_USERCONFIG', registry: normalizedRegistry };
  }

  return { token: '', source: 'none', registry: normalizedRegistry };
}

export function buildTokenUserConfig({ registry, token }) {
  const normalizedRegistry = normalizeRegistry(registry);
  const authKey = getRegistryAuthKey(normalizedRegistry);
  return [
    `registry=${normalizedRegistry}`,
    `${authKey}=${token}`,
    'always-auth=true',
  ].join('\n') + '\n';
}