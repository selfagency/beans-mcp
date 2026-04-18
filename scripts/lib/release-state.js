export const DEFAULT_NPM_OTP_1PASSWORD_ITEM = '';

export function getReleaseMetadataFiles() {
  return ['package.json', 'docs/public/server.json', 'docs/public/.well-known/mcp/server-card.json', 'CHANGELOG.md'];
}

export function resolveOtpItemId(env) {
  return (
    env.NPM_OTP_1PASSWORD_ITEM?.trim() || env.DEFAULT_NPM_OTP_1PASSWORD_ITEM?.trim() || DEFAULT_NPM_OTP_1PASSWORD_ITEM
  );
}

export function buildRollbackPlan({ commitLocal, commitPushed, tagPushed, githubReleaseCreated, releaseDone }) {
  if (releaseDone) {
    return {
      deleteGitHubRelease: false,
      deleteTag: false,
      revertCommit: false,
      resetLocalCommit: false,
    };
  }

  return {
    deleteGitHubRelease: githubReleaseCreated,
    deleteTag: tagPushed,
    revertCommit: commitPushed,
    resetLocalCommit: !commitPushed && commitLocal,
  };
}
