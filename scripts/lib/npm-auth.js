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
  const [firstCandidate] = resolveNpmPublishAuthCandidates({ env, registry, userConfigContent });
  if (firstCandidate) {
    return firstCandidate;
  }

  return { token: '', source: 'none', registry: normalizeRegistry(registry) };
}

export function resolveNpmPublishAuthCandidates({ env, registry, userConfigContent }) {
  const normalizedRegistry = normalizeRegistry(registry);
  const candidates = [];
  const seenTokens = new Set();

  const addCandidate = (token, source) => {
    const trimmed = token?.trim();
    if (!trimmed || seenTokens.has(trimmed)) {
      return;
    }

    seenTokens.add(trimmed);
    candidates.push({ token: trimmed, source, registry: normalizedRegistry });
  };

  addCandidate(env.NPM_TOKEN, 'NPM_TOKEN');
  addCandidate(env.NODE_AUTH_TOKEN, 'NODE_AUTH_TOKEN');
  addCandidate(extractAuthTokenFromNpmrc(userConfigContent, normalizedRegistry), 'NPM_CONFIG_USERCONFIG');

  return candidates;
}

export function buildTokenUserConfig({ registry, token }) {
  const normalizedRegistry = normalizeRegistry(registry);
  const authKey = getRegistryAuthKey(normalizedRegistry);
  return [`registry=${normalizedRegistry}`, `${authKey}=${token}`, 'always-auth=true'].join('\n') + '\n';
}
