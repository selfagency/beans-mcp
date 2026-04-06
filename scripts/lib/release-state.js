export const DEFAULT_NPM_OTP_1PASSWORD_ITEM = 'm2z3dl3f5je3vdq76cqsk5g6zy';

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