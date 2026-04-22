import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_SCHEMA_URL = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

export function loadJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadRegistryMetadata(rootDir) {
  const packageJsonPath = resolve(rootDir, 'package.json');
  const serverJsonPath = resolve(rootDir, 'docs/public/server.json');

  return {
    packageJsonPath,
    serverJsonPath,
    packageJson: loadJsonFile(packageJsonPath),
    serverJson: loadJsonFile(serverJsonPath),
  };
}

export function validateRegistryMetadataSync({ packageJson, serverJson }) {
  const errors = [];
  const pkgName = packageJson?.name;
  const pkgVersion = packageJson?.version;
  const pkgMcpName = packageJson?.mcpName;
  const serverName = serverJson?.name;
  const serverVersion = serverJson?.version;
  const firstPackage = Array.isArray(serverJson?.packages) ? serverJson.packages[0] : null;

  if (!pkgMcpName) {
    errors.push('package.json must include mcpName.');
  }

  if (!serverName) {
    errors.push('docs/public/server.json must include name.');
  }

  if (pkgMcpName && serverName && pkgMcpName !== serverName) {
    errors.push(`mcpName mismatch: package.json has '${pkgMcpName}', server.json has '${serverName}'.`);
  }

  if (!pkgVersion || !serverVersion) {
    errors.push('package.json version and server.json version are required.');
  } else if (pkgVersion !== serverVersion) {
    errors.push(`version mismatch: package.json has '${pkgVersion}', server.json has '${serverVersion}'.`);
  }

  if (!firstPackage) {
    errors.push('docs/public/server.json must contain packages[0].');
  } else {
    if (!firstPackage.version) {
      errors.push('docs/public/server.json packages[0].version is required.');
    } else if (pkgVersion && firstPackage.version !== pkgVersion) {
      errors.push(
        `package version mismatch: package.json has '${pkgVersion}', server.json packages[0].version has '${firstPackage.version}'.`,
      );
    }

    if (!firstPackage.identifier) {
      errors.push('docs/public/server.json packages[0].identifier is required.');
    } else if (pkgName && firstPackage.identifier !== pkgName) {
      errors.push(
        `package identifier mismatch: package.json name is '${pkgName}', server.json packages[0].identifier is '${firstPackage.identifier}'.`,
      );
    }
  }

  return errors;
}

export function validateServerJsonSchemaSubset({ serverJson, schema }) {
  const errors = [];
  const serverDef = schema?.definitions?.ServerDetail;
  const packageDef = schema?.definitions?.Package;

  if (!serverDef || !packageDef) {
    return ['schema definitions.ServerDetail and definitions.Package are required for validation.'];
  }

  const requiredServerKeys = Array.isArray(serverDef.required) ? serverDef.required : [];
  for (const key of requiredServerKeys) {
    if (serverJson?.[key] === undefined || serverJson?.[key] === null) {
      errors.push(`server.json missing required field '${key}'.`);
    }
  }

  const namePattern = serverDef?.properties?.name?.pattern;
  if (typeof namePattern === 'string' && typeof serverJson?.name === 'string') {
    if (!new RegExp(namePattern).test(serverJson.name)) {
      errors.push(`server.json name '${serverJson.name}' does not match schema pattern '${namePattern}'.`);
    }
  }

  const packages = Array.isArray(serverJson?.packages) ? serverJson.packages : [];
  const requiredPackageKeys = Array.isArray(packageDef.required) ? packageDef.required : [];
  for (const [index, pkg] of packages.entries()) {
    for (const key of requiredPackageKeys) {
      if (pkg?.[key] === undefined || pkg?.[key] === null) {
        errors.push(`server.json packages[${index}] missing required field '${key}'.`);
      }
    }
  }

  return errors;
}

export async function fetchRegistrySchema(schemaUrl = DEFAULT_SCHEMA_URL) {
  const response = await fetch(schemaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch registry schema (${response.status} ${response.statusText}) from ${schemaUrl}`);
  }

  return response.json();
}

export async function validateRegistryMetadata({ rootDir, schemaUrl = DEFAULT_SCHEMA_URL }) {
  const { packageJson, serverJson } = loadRegistryMetadata(rootDir);
  const syncErrors = validateRegistryMetadataSync({ packageJson, serverJson });
  const schema = await fetchRegistrySchema(schemaUrl);
  const schemaErrors = validateServerJsonSchemaSubset({ serverJson, schema });

  return [...syncErrors, ...schemaErrors];
}

export function formatValidationErrors(errors) {
  return errors.map(error => `- ${error}`).join('\n');
}
