export const DEFAULT_NPM_OTP_1PASSWORD_ITEM = 'REMOVED_1PASSWORD_ITEM_ID';

export function getReleaseMetadataFiles() {
  return ['package.json', 'server.json', 'CHANGELOG.md'];
}

export function resolveOtpItemId(env) {
  return env.NPM_OTP_1PASSWORD_ITEM?.trim() || DEFAULT_NPM_OTP_1PASSWORD_ITEM;
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