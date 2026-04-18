#!/usr/bin/env zx

import { Octokit } from '@octokit/rest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ora from 'ora';
import { buildTokenUserConfig, extractAuthTokenFromNpmrc, normalizeRegistry } from './lib/npm-auth.js';
import { buildRollbackPlan, getReleaseMetadataFiles, resolveOtpItemId } from './lib/release-state.js';

$.verbose = false;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
cd(ROOT);

// ---------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------

const version = argv._[0];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: pnpm release <version>   (e.g. pnpm release 1.0.5)');
  process.exit(1);
}

const tag = `v${version}`;

// ---------------------------------------------------------------------------
// Rollback state
//   commitLocal  — release commit exists locally but has not been pushed
//   commitPushed — release commit has been pushed to origin/main
//   tagPushed    — tag has been pushed but release workflow has not yet succeeded
//   releaseDone  — release workflow succeeded; nothing to undo
// ---------------------------------------------------------------------------

let commitLocal = false;
let commitPushed = false;
let tagPushed = false;
let releaseDone = false;
let gitCmd = 'git';
let githubReleaseCreated = false;
let githubClient = null;
let githubOwner = '';
let githubRepo = '';

function runGit(args, options = {}) {
  const result = spawnSync(gitCmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    const details = stderr || stdout || `git ${args.join(' ')} failed with exit code ${result.status}`;
    throw new Error(details);
  }

  return result;
}

/**
 * Run a subprocess attached to the caller terminal so interactive auth flows
 * (OTP prompts, browser login handoffs) can complete successfully.
 */
function runInteractive(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...options,
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed to spawn: ${result.error.message}`);
  }

  if (result.signal) {
    throw new Error(`${command} ${args.join(' ')} was terminated by signal ${result.signal}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function resolveGitExecutable() {
  const direct = spawnSync('git', ['--version'], { stdio: 'ignore', shell: false });
  if (direct.status === 0) {
    return 'git';
  }

  const locatorCommand = process.platform === 'win32' ? 'where' : 'which';
  const located = spawnSync(locatorCommand, ['git'], { encoding: 'utf8', shell: false });
  if (located.status === 0) {
    const candidate = located.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function buildSanitizedNpmEnv({ baseEnv, userConfigPath, registry, token }) {
  const env = { ...baseEnv };

  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_config_') || key.startsWith('NPM_CONFIG_')) {
      delete env[key];
    }
  }

  env.NPM_CONFIG_USERCONFIG = userConfigPath;
  env.npm_config_userconfig = userConfigPath;
  env.NPM_CONFIG_REGISTRY = registry;
  env.npm_config_registry = registry;
  if (token) {
    // Keep both spellings so any nested tooling that prefers env-token auth can resolve it.
    env.NPM_TOKEN = token;
    env.NODE_AUTH_TOKEN = token;
  }
  env.CI ||= 'true';

  return env;
}

function resolveInterpolatedToken(rawToken, env) {
  const token = (rawToken || '').trim();
  const interpolated = token.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (!interpolated) {
    return token;
  }

  const envName = interpolated[1];
  return envName ? (env[envName] || '').trim() : '';
}

async function rollback() {
  const plan = buildRollbackPlan({
    commitLocal,
    commitPushed,
    tagPushed,
    githubReleaseCreated,
    releaseDone,
  });

  if (!plan.deleteGitHubRelease && !plan.deleteTag && !plan.revertCommit && !plan.resetLocalCommit) {
    return;
  }

  $.verbose = false;
  try {
    if (plan.deleteGitHubRelease && githubClient && githubOwner && githubRepo) {
      console.log(`\n⚠️  npm publish failed after creating GitHub release ${tag}. Deleting GitHub release...`);
      try {
        const release = await githubClient.repos.getReleaseByTag({ owner: githubOwner, repo: githubRepo, tag });
        await githubClient.repos.deleteRelease({ owner: githubOwner, repo: githubRepo, release_id: release.data.id });
        githubReleaseCreated = false;
        console.log(`↩️  GitHub release ${tag} deleted.`);
      } catch (error) {
        if (error?.status !== 404) {
          console.error(`❌ Could not delete GitHub release ${tag}. Manually run:`);
          console.error(`   gh release delete ${tag} -y`);
        }
      }
    }

    if (plan.deleteTag) {
      console.log(`\n⚠️  Release workflow failed or was interrupted. Deleting remote tag ${tag}...`);
      try {
        runGit(['push', 'origin', '--delete', tag]);
        runGit(['tag', '-d', tag]);
        console.log(`↩️  Tag ${tag} deleted from remote and local.`);
      } catch {
        console.error(`❌ Could not delete tag. Manually run:`);
        console.error(`   git push origin --delete ${tag} && git tag -d ${tag}`);
      }
    }
    if (plan.revertCommit) {
      console.log('\n⚠️  Reverting release commit on origin/main...');
      try {
        runGit(['revert', '--no-edit', 'HEAD']);
        runGit(['push', 'origin', 'main']);
        console.log('↩️  Release commit reverted and pushed. Working tree is clean.');
      } catch {
        console.error('❌ Automatic revert failed. Manually run:');
        console.error('   git revert HEAD && git push origin main');
      }
    } else if (plan.resetLocalCommit) {
      console.log('\n⚠️  Release aborted before push. Resetting local release commit...');
      try {
        runGit(['reset', '--hard', 'HEAD~1']);
        console.log('↩️  Local release commit removed. Working tree restored.');
      } catch {
        console.error('❌ Reset failed. Manually run: git reset --hard HEAD~1');
      }
    }
  } catch {
    /* best effort */
  }
}

process.on('SIGINT', async () => {
  await rollback();
  process.exit(130);
});
process.on('SIGTERM', async () => {
  await rollback();
  process.exit(143);
});

// ---------------------------------------------------------------------------
// Main — wrapped so any unhandled error triggers rollback
// ---------------------------------------------------------------------------

async function main() {
  // --- Prerequisites -------------------------------------------------------

  const resolvedGit = resolveGitExecutable();
  if (!resolvedGit) {
    console.error("❌ 'git' is required but not found in PATH.");
    process.exit(1);
  }
  gitCmd = resolvedGit;

  // Ensure npm uses the user's ~/.npmrc (tokens) and the public npm registry.
  // Some CI shells or tool integrations start without HOME/USERCONFIG, which causes
  // `npm whoami` to prompt for interactive login even when a token exists.
  const NPM_REGISTRY = normalizeRegistry(process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org/');
  const defaultUserConfigPath = resolve(homedir(), '.npmrc');
  const explicitUserConfigPath = process.env.NPM_CONFIG_USERCONFIG?.trim();

  const userConfigPaths = Array.from(
    new Set(
      [explicitUserConfigPath, defaultUserConfigPath].filter(
        candidate => typeof candidate === 'string' && candidate.trim().length > 0,
      ),
    ),
  );

  const publishAuthCandidates = [];
  const seenTokens = new Set();

  const addCandidate = (rawToken, source) => {
    const token = resolveInterpolatedToken(rawToken, process.env);
    if (!token || seenTokens.has(token)) {
      return;
    }
    seenTokens.add(token);
    publishAuthCandidates.push({ token, source, registry: NPM_REGISTRY });
  };

  addCandidate(process.env.NPM_TOKEN, 'NPM_TOKEN');
  addCandidate(process.env.NODE_AUTH_TOKEN, 'NODE_AUTH_TOKEN');

  for (const path of userConfigPaths) {
    const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const npmrcToken = extractAuthTokenFromNpmrc(content, NPM_REGISTRY);
    addCandidate(npmrcToken, `npmrc:${path}`);
  }

  if (publishAuthCandidates.length === 0) {
    console.error(`❌ No npm auth token found for ${NPM_REGISTRY}`);
    console.error('   Tips:');
    console.error('   - Export NPM_TOKEN or NODE_AUTH_TOKEN before running the release script');
    console.error(`   - Or ensure ${defaultUserConfigPath} contains //registry.npmjs.org/:_authToken=<YOUR_TOKEN>`);
    if (explicitUserConfigPath) {
      console.error(`   - Current NPM_CONFIG_USERCONFIG is ${explicitUserConfigPath}`);
    }
    console.error(
      '   - If your npm account requires 2FA for writes, the token must have write access and Bypass 2FA enabled',
    );
    process.exit(1);
  }

  const npmUserConfigDir = mkdtempSync(resolve(tmpdir(), 'beans-mcp-npm-'));
  const npmUserConfigPath = resolve(npmUserConfigDir, '.npmrc');
  let selectedAuth = null;
  let selectedNpmEnv = null;

  for (const candidate of publishAuthCandidates) {
    writeFileSync(npmUserConfigPath, buildTokenUserConfig({ registry: NPM_REGISTRY, token: candidate.token }), 'utf8');

    const candidateEnv = buildSanitizedNpmEnv({
      baseEnv: process.env,
      userConfigPath: npmUserConfigPath,
      registry: NPM_REGISTRY,
      token: candidate.token,
    });

    try {
      await $({ env: candidateEnv })`npm whoami --userconfig=${npmUserConfigPath} --registry=${NPM_REGISTRY}`;
      selectedAuth = candidate;
      selectedNpmEnv = candidateEnv;
      break;
    } catch {
      // Try the next candidate. This commonly happens when NPM_TOKEN is stale but ~/.npmrc is valid.
    }
  }

  if (!selectedAuth || !selectedNpmEnv) {
    console.error(`❌ Not logged in to npm (registry: ${NPM_REGISTRY}).`);
    console.error('   Tried auth sources in order: NPM_TOKEN, NODE_AUTH_TOKEN, NPM_CONFIG_USERCONFIG');
    console.error('   Tips:');
    console.error('   - If NPM_TOKEN is set, ensure it is valid (stale tokens override npm login by default)');
    console.error(`   - Ensure your token is in ${npmUserConfigPath}`);
    console.error(`   - Ensure ~/.npmrc (${defaultUserConfigPath}) has a valid token if using npm login`);
    if (explicitUserConfigPath) {
      console.error(`   - NPM_CONFIG_USERCONFIG was ${explicitUserConfigPath}; the script also checked ~/.npmrc`);
    }
    console.error('   - File should contain a line like: //registry.npmjs.org/:_authToken=<YOUR_TOKEN>');
    console.error('   - Or export NPM_TOKEN in your environment before running the release script');
    console.error('   - If npm still asks for OTP, use a granular token with write access and Bypass 2FA enabled');
    console.error('   - To log in interactively: npm login --registry=https://registry.npmjs.org/');
    rmSync(npmUserConfigDir, { recursive: true, force: true });
    process.exit(1);
  }

  process.env.NPM_CONFIG_USERCONFIG = npmUserConfigPath;
  process.env.npm_config_userconfig = npmUserConfigPath;
  process.env.NPM_CONFIG_REGISTRY = NPM_REGISTRY;
  process.env.npm_config_registry = NPM_REGISTRY;
  process.env.CI ||= 'true';

  $.env = selectedNpmEnv;

  console.log(`🔐 Using npm auth from ${selectedAuth.source}.`);

  // Resolve GitHub auth token: prefer env vars, then ask the gh CLI.
  let githubToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
  if (!githubToken) {
    try {
      githubToken = (await $`gh auth token`).stdout.trim();
    } catch {
      console.error('❌ No GitHub token found. Set GH_TOKEN/GITHUB_TOKEN or run: gh auth login');
      process.exit(1);
    }
  }

  const octokit = new Octokit({ auth: githubToken });
  githubClient = octokit;

  // --- Precondition checks --------------------------------------------------

  const dirty = runGit(['status', '--porcelain']).stdout.trim();
  if (dirty) {
    console.error('❌ Working tree is not clean. Commit or stash changes first.');
    process.exit(1);
  }

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  if (branch !== 'main') {
    console.error(`❌ Must run from 'main'. Current branch: ${branch}`);
    process.exit(1);
  }

  console.log('🔄 Fetching latest refs...');
  runGit(['fetch', 'origin', 'main']);
  runGit(['pull', '--ff-only', 'origin', 'main']);

  // Derive owner/repo from the git remote URL.
  const remoteUrl = runGit(['remote', 'get-url', 'origin']).stdout.trim();
  const repoMatch = remoteUrl.match(/[:/]([^/]+)\/([^/.]+?)(\.git)?$/);
  if (!repoMatch) {
    console.error(`❌ Cannot parse owner/repo from remote URL: ${remoteUrl}`);
    process.exit(1);
  }
  const [, owner, repo] = repoMatch;
  githubOwner = owner;
  githubRepo = repo;

  // Check for existing local tag.
  const localTag = runGit(['tag', '-l', tag]).stdout.trim();
  if (localTag) {
    console.error(`❌ Local tag ${tag} already exists.`);
    process.exit(1);
  }

  // Check for existing remote tag via the API.
  try {
    await octokit.git.getRef({ owner, repo, ref: `tags/${tag}` });
    console.error(`❌ Remote tag ${tag} already exists.`);
    process.exit(1);
  } catch (err) {
    if (err.status !== 404) {
      throw err;
    }
    // 404 = tag does not exist; that's what we want.
  }

  // --- Previous tag (for release notes diff) --------------------------------

  const tagsResp = await octokit.paginate(octokit.git.listMatchingRefs, {
    owner,
    repo,
    ref: 'tags/v',
    per_page: 100,
  });

  const previousTag =
    tagsResp
      .map(r => r.ref.replace('refs/tags/', ''))
      .filter(t => t !== tag)
      .sort((a, b) => {
        const parse = v => v.replace(/^v/, '').split('.').map(Number);
        const [aMaj, aMin, aPatch] = parse(a);
        const [bMaj, bMin, bPatch] = parse(b);
        return aMaj - bMaj || aMin - bMin || aPatch - bPatch;
      })
      .at(-1) ?? '';

  // --- Release notes --------------------------------------------------------

  console.log(`📝 Generating release notes for ${tag}...`);

  const notesResp = await octokit.repos.generateReleaseNotes({
    owner,
    repo,
    tag_name: tag,
    target_commitish: 'main',
    ...(previousTag ? { previous_tag_name: previousTag } : {}),
  });
  const releaseNotes = notesResp.data.body?.trim() || '- No notable changes.';

  // --- Update package.json --------------------------------------------------
  console.log(`🧩 Updating package.json to ${version}...`);
  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // --- Update server.json (optional legacy root descriptor) -----------------
  const serverJsonPath = resolve(ROOT, 'server.json');
  if (existsSync(serverJsonPath)) {
    let serverJson;
    try {
      serverJson = JSON.parse(readFileSync(serverJsonPath, 'utf8'));
      serverJson.version = version;
      if (Array.isArray(serverJson.packages) && serverJson.packages.length > 0) {
        serverJson.packages[0].version = version;
      }
      writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2) + '\n');
      console.log(`🧩 Updated server.json to ${version}...`);
    } catch (e) {
      console.error('❌ Failed to update server.json:', e);
      process.exit(1);
    }
  } else {
    console.log('ℹ️  server.json not found at repository root; skipping legacy descriptor update.');
  }

  // --- Update docs/public/server.json --------------------------------------
  const docsServerJsonPath = resolve(ROOT, 'docs/public/server.json');
  let docsServerJson;
  try {
    docsServerJson = JSON.parse(readFileSync(docsServerJsonPath, 'utf8'));
    docsServerJson.version = version;
    if (Array.isArray(docsServerJson.packages) && docsServerJson.packages.length > 0) {
      docsServerJson.packages[0].version = version;
    }
    writeFileSync(docsServerJsonPath, JSON.stringify(docsServerJson, null, 2) + '\n');
    console.log(`🧩 Updated docs/public/server.json to ${version}...`);
  } catch (e) {
    console.error('❌ Failed to update docs/public/server.json:', e);
    process.exit(1);
  }

  // --- Update docs/public/.well-known/mcp/server-card.json -----------------
  const serverCardPath = resolve(ROOT, 'docs/public/.well-known/mcp/server-card.json');
  let serverCard;
  try {
    serverCard = JSON.parse(readFileSync(serverCardPath, 'utf8'));
    if (!serverCard.serverInfo || typeof serverCard.serverInfo !== 'object') {
      serverCard.serverInfo = {};
    }
    serverCard.serverInfo.version = version;
    if (Array.isArray(serverCard.transports)) {
      for (const transport of serverCard.transports) {
        if (transport?.package && typeof transport.package === 'object') {
          transport.package.version = version;
        }
      }
    }
    writeFileSync(serverCardPath, JSON.stringify(serverCard, null, 2) + '\n');
    console.log(`🧩 Updated docs/public/.well-known/mcp/server-card.json to ${version}...`);
  } catch (e) {
    console.error('❌ Failed to update docs/public/.well-known/mcp/server-card.json:', e);
    process.exit(1);
  }

  // --- Update CHANGELOG.md --------------------------------------------------

  console.log('🧩 Updating CHANGELOG.md...');
  const changelogPath = resolve(ROOT, 'CHANGELOG.md');
  const date = new Date().toISOString().slice(0, 10);
  const heading = `## [${version}] - ${date}`;
  const sourceLine = previousTag ? `\n\n_Source: changes from ${previousTag} to ${tag}._` : '';
  const section = `\n${heading}\n\n${releaseNotes}${sourceLine}\n`;

  let original;
  try {
    original = readFileSync(changelogPath, 'utf8');
  } catch {
    original = '# Change Log\n\n## [Unreleased]\n';
  }

  if (!original.includes(heading)) {
    const marker = '## [Unreleased]';
    const idx = original.indexOf(marker);
    const updated =
      idx >= 0
        ? `${original.slice(0, idx + marker.length)}\n${section}${original.slice(idx + marker.length)}`
        : `${original}\n${section}`;
    writeFileSync(changelogPath, updated);
  } else {
    console.log('ℹ️  CHANGELOG already contains this release heading; skipping.');
  }

  // --- Commit + push --------------------------------------------------------

  const releaseMetadataFiles = getReleaseMetadataFiles();
  const hasChanges = runGit(['diff', '--name-only', '--', ...releaseMetadataFiles]).stdout.trim();
  if (hasChanges) {
    console.log('📦 Committing release metadata changes...');
    runGit(['add', ...releaseMetadataFiles]);
    runGit(['commit', '-m', `chore(release): update version and changelog for ${tag}`]);
    commitLocal = true;
  } else {
    console.log('ℹ️  No version/changelog changes detected; nothing to commit.');
  }

  console.log('🚀 Pushing main...');
  runGit(['push', 'origin', 'main']);
  commitPushed = true;
  commitLocal = false;

  const headSha = runGit(['rev-parse', 'HEAD']).stdout.trim();

  // --- Wait for required workflows (sequential to avoid concurrent-spinner visual corruption) ------

  const shortSha = headSha.slice(0, 7);
  console.log(`🔎 Waiting for required workflows on ${shortSha}...`);
  // Give GitHub a moment to register the push before we start polling.
  await sleep(10_000);

  const spinner = ora({ text: 'Tests: queued' }).start();
  for (const name of ['Test & Build']) {
    spinner.text = `${name}: queued`;
    spinner.start();
    await waitForWorkflow(octokit, name, owner, repo, headSha, spinner);
  }

  // --- npm publish ----------------------------------------------------------

  console.log('📦 Building package...');
  $.verbose = true;
  await $`pnpm build`;
  $.verbose = false;

  const distTag = version.includes('-') ? 'next' : 'latest';
  console.log(`🚀 Publishing ${tag} to npm (dist-tag: ${distTag})...`);
  $.verbose = true;
  const otpItemId = resolveOtpItemId(process.env);
  const envOtp = (process.env.NPM_PUBLISH_OTP || process.env.NPM_OTP || '').trim();
  // For scoped public packages, --access public is required on first publish; harmless on subsequent publishes.
  const accessFlag = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).name || '').startsWith('@')
    ? ['--access', 'public']
    : [];
  try {
    let otp = envOtp;
    if (!otp && otpItemId) {
      otp = (await $`op item get ${otpItemId} --otp`).stdout.trim();
      if (!otp) {
        throw new Error(`Failed to retrieve npm OTP from 1Password item ${otpItemId}`);
      }
    }

    // Re-verify auth right before publish using the exact same env/config path,
    // so npm publish never falls back to interactive login behavior.
    await $({ env: selectedNpmEnv })`npm whoami --userconfig=${npmUserConfigPath} --registry=${NPM_REGISTRY}`;

    const publishArgs = [
      'publish',
      './dist',
      `--userconfig=${npmUserConfigPath}`,
      '--tag',
      distTag,
      `--registry=${NPM_REGISTRY}`,
      ...accessFlag,
      ...(otp ? [`--otp=${otp}`] : []),
    ];
    try {
      await $({ env: selectedNpmEnv })`npm ${publishArgs}`;
    } catch (err) {
      const output = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`;
      if (!output.includes('EOTP')) {
        throw err;
      }

      console.error('⚠️  npm publish requested interactive OTP/browser authentication.');
      console.error('   Retrying publish in interactive mode...');
      $.verbose = false;
      runInteractive('npm', publishArgs, { env: selectedNpmEnv });
    }
    $.verbose = false;
    console.log(`✅ Published ${tag} to npm.`);
  } catch (err) {
    $.verbose = false;
    const output = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`;
    if (output.includes('EOTP')) {
      console.error('❌ npm publish requested an OTP even though token auth was configured.');
      console.error('   npm now requires a granular write token with Bypass 2FA enabled for OTP-less publishes.');
      console.error('   Update the token on your npm account, then retry the release.');
      console.error('   If your account still requires OTP, set NPM_PUBLISH_OTP or NPM_OTP.');
      console.error('   Optional: set NPM_OTP_1PASSWORD_ITEM (or DEFAULT_NPM_OTP_1PASSWORD_ITEM) for automatic OTP retrieval.');
    }
    throw err;
  } finally {
    rmSync(npmUserConfigDir, { recursive: true, force: true });
  }

  // Once npm publish succeeds, we never auto-rollback commit/tag/release:
  // npm versions are immutable and should remain paired with source metadata.
  releaseDone = true;

  // --- Tag + GitHub release -------------------------------------------------

  console.log(`🏷️  Creating annotated tag ${tag} at ${headSha}...`);

  const tagMessage = [
    `Release ${tag}`,
    releaseNotes,
    previousTag ? `Source: changes from ${previousTag} to ${tag}.` : '',
    `Target commit: ${headSha}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  runGit(['tag', '-a', tag, headSha, '-m', tagMessage]);

  console.log(`🚀 Pushing tag ${tag}...`);
  runGit(['push', 'origin', tag]);
  tagPushed = true;

  // --- Watch the release workflow ------------------------------------------

  spinner.text = 'Release: waiting for workflow to trigger...';
  spinner.start();
  await waitForWorkflow(octokit, 'Release', owner, repo, headSha, spinner, {
    autoDispatch: false,
    branch: null,
  });

  githubReleaseCreated = true;
  console.log(`✅ GitHub release complete: ${tag} → ${headSha}`);
}

// ---------------------------------------------------------------------------
// Workflow polling
// ---------------------------------------------------------------------------

async function waitForWorkflow(
  octokit,
  name,
  owner,
  repo,
  headSha,
  spinner,
  { timeoutMs = 3_600_000, pollMs = 15_000, autoDispatch = true, branch = 'main' } = {},
) {
  // Resolve the workflow ID by name.
  const workflowsResp = await octokit.actions.listRepoWorkflows({ owner, repo, per_page: 100 });
  const workflow = workflowsResp.data.workflows.find(w => w.name === name);
  if (!workflow) {
    spinner.fail(`${name}: workflow not found in ${owner}/${repo}`);
    throw new Error(`[${name}] workflow not found in ${owner}/${repo}`);
  }

  const deadline = Date.now() + timeoutMs;
  let triggered = false;
  // Track cancelled run IDs so we skip them on subsequent polls and don't
  // mistake them for the new run that was re-dispatched.
  const cancelledRunIds = new Set();

  while (Date.now() < deadline) {
    const runsResp = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflow.id,
      ...(branch ? { branch } : {}),
      head_sha: headSha,
      per_page: 10,
    });

    // Find the latest run that isn't one we already marked as cancelled.
    const run = runsResp.data.workflow_runs.find(r => !cancelledRunIds.has(r.id));

    if (!run) {
      if (autoDispatch && !triggered) {
        spinner.text = `${name}: no run found — triggering workflow_dispatch...`;
        await octokit.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflow.id, ref: 'main' });
        triggered = true;
        spinner.text = `${name}: waiting for run to appear...`;
      } else {
        spinner.text = `${name}: waiting for run to appear...`;
      }
    } else if (run.status !== 'completed') {
      const elapsed = Math.round((Date.now() - new Date(run.created_at).getTime()) / 1000);
      spinner.text = `${name}: ${run.status} (${elapsed}s elapsed)`;
    } else if (run.conclusion === 'success') {
      spinner.succeed(`${name}: passed`);
      return;
    } else if (run.conclusion === 'cancelled') {
      // Cancelled runs are often caused by a concurrent push racing with CI startup.
      // Record this run so we skip it on future polls, then re-dispatch.
      cancelledRunIds.add(run.id);
      spinner.text = `${name}: run was cancelled — re-dispatching...`;
      triggered = false;
    } else {
      spinner.fail(`${name}: ${run.conclusion}`);
      throw new Error(`[${name}] conclusion=${run.conclusion}\n   Run: ${run.html_url}`);
    }

    await sleep(pollMs);
  }

  spinner.fail(`${name}: timed out`);
  throw new Error(`[${name}] timed out after ${timeoutMs / 1000}s`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch(async err => {
  const msg = err?.message ?? String(err);
  // ProcessOutput errors from zx already printed the command output; only
  // print extra context for our own thrown errors.
  if (!(err instanceof ProcessOutput)) {
    console.error(`❌ ${msg}`);
  }
  await rollback();
  process.exit(err?.exitCode ?? 1);
});
