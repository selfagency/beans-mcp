---
name: git-mcp-workflow
description: 'Use for repositories managed through the git-mcp server when an agent needs to inspect repository state, create commits, manage branches and remotes, rebase, cherry-pick, stash, bisect, work with worktrees, handle Git Flow or git-flow-next-style workflows, manage tags, recover from mistakes, or explain Git concepts using MCP tools instead of raw git CLI commands. Especially relevant for prompts about git_status, git_commit, git_push, git_rebase, git_cherry_pick, git_worktree, git_stash, git_reflog, git_flow, git_lfs, submodules, PR preparation, release tagging, and Git recovery. IMPORTANT: Never use shell/terminal to run git commands directly; always use git-mcp MCP tools instead.'
---

# Git MCP Workflow

An MCP-first workflow skill for repositories exposed through `git-mcp`.

This skill adapts common Git guidance for a world where the preferred interface is the server's tool catalog, not ad-hoc shell commands. It covers both everyday Git work and the spicier recovery and history-editing cases.

## Why LLMs Must Not Use the Git CLI

**Using `git` directly via the shell is highly error-prone for LLMs and should be considered forbidden except as a narrow last resort.**

The root cause is structural: Git commands frequently require commit messages, branch names, file paths, and other string arguments that contain spaces, quotes, special characters, or newlines. Shell interpreters handle quoting through multiple layers (single quotes, double quotes, `$'...'` escapes, heredocs) and the rules differ between `sh`, `bash`, and `zsh`. LLMs routinely produce subtly malformed quoting that causes:

- Commit messages truncated at the first space or quote character
- Arguments interpreted as flags (a message starting with `-` becomes a flag)
- Multi-line messages collapsed to one line or silently dropped
- Shell word-splitting breaking file paths that contain spaces
- Quote nesting errors causing the command to hang waiting for a closing delimiter
- `$` or backtick characters in messages accidentally triggering command substitution

These errors are often **silent**: the command appears to succeed, but the result is wrong (e.g., a commit message of `"fix"` instead of `"fix: resolve null pointer in auth handler"`). LLMs typically cannot observe the actual error because the shell may not surface it clearly in the tool output.

**The `git-mcp` server solves all of this.** Every tool parameter is a typed, validated field that the server passes directly to `simple-git` as an argument array, bypassing shell interpretation entirely. There are no quoting problems, no interpolation hazards, and no silent truncation.

**Rule: Always use `git-mcp` MCP tools for git operations. Never invoke `git` via shell unless the specific operation is genuinely not available through any `git-mcp` tool.**

## When to Use This Skill

Use this skill when you need to:

- Inspect repository state before making changes
- Stage, commit, branch, fetch, pull, and push via MCP tools
- Rebase, cherry-pick, stash, bisect, tag, or use worktrees
- Recover from resets, detached HEAD, or other Git mishaps
- Choose between GitHub Flow, classic Git Flow, git-flow-next-style presets, trunk-based, or release workflows
- Prepare a branch for review or release while preserving safety
- Explain Git concepts in terms of the `git-mcp` tool surface

## Core Operating Rules

### 1. Start with context, not vibes

For any non-trivial task, begin with:

1. `git_context action=summary`
2. `git_status action=status`
3. Targeted inspection: `git_history action=log`, `git_status action=diff`, `git_history action=show`, or `git_branches action=list`

`git_context action=summary` is the default entry point. It reports branch, upstream, pending changes, and in-progress operations (rebase, cherry-pick, merge, bisect).

### 2. Inspect before mutate

Prefer read-only calls first:

- `git_context action=summary` — repo state snapshot
- `git_status action=status` — working tree details
- `git_history action=log` — commit history
- `git_history action=show ref=<SHA>` — one commit inspection
- `git_status action=diff mode=unstaged` — unstaged changes
- `git_history action=blame file_path=<path>` — line attribution
- `git_history action=reflog` — recovery ledger
- `git_branches action=list` — local branches
- `git_remotes action=list` — configured remotes
- `git_context action=search query=<terms>` — history/code search
- `git_docs action=man query=<command>` — official docs

Only mutate after you understand:

- current branch and tracking state
- whether the tree is clean or dirty
- whether a merge, rebase, cherry-pick, or bisect is already in progress

### 3. Prefer the safest reversible operation

Safety order for undo and recovery:

1. `git_commits action=restore` for uncommitted file changes
2. `git_workspace action=stash_all` when switching context without losing work
3. `git_commits action=revert` for undoing published commits
4. `git_commits action=undo` for soft-resetting the last local commit
5. `git_commits action=reset mode=mixed` for local unpublished history
6. `git_commits action=reset mode=hard confirm=true` only with explicit user intent

Before any history-rewriting step, capture `git_history action=reflog` and `git_history action=log`.

### 4. Treat published history as radioactive

Rewriting history is allowed only when the user clearly wants it and the branch is safe to rewrite.

- Rebase only on unpublished or explicitly approved branches
- After rebasing, prefer `git_remotes action=push force_with_lease=true`
- Avoid unconditional force pushes unless the user explicitly requests them and `GIT_ALLOW_FORCE_PUSH=true` is set server-side
- Prefer `git_commits action=revert` over reset for shared branches

### 5. Respect hooks and CI

Do not bypass hooks casually.

- `no_verify` on `git_commits action=commit` and `git_remotes action=push` should stay `false` unless the user explicitly requests a bypass and `GIT_ALLOW_NO_VERIFY=true` is set server-side
- If hooks fail, fix the root cause
- In this repository specifically, `.husky/pre-commit` runs `pnpm exec lint-staged` and `pnpm typecheck`

### 6. Use adjacent tooling only where git-mcp stops

`git-mcp` covers repository operations, not every GitHub action.

- Use GitHub tooling for pull requests, review threads, approvals, and GitHub Releases
- Use workspace file tools for checking `.gitignore`, worktree directories, and project files
- **Never invoke `git` via the shell when a `git-mcp` tool exists for that operation.** The quoting hazards described above are not theoretical — they will corrupt commit messages, truncate arguments, and produce silent failures.

Narrow cases where CLI may still be necessary (confirm no MCP tool covers it first):

- interactive patch staging (`git add -p`)
- interactive rebase editing for squash/reword/reorder/drop flows
- `git filter-repo`-style deep history surgery
- repo-local hook installation commands

## Registered Tool Surface

The server exposes these tools (and only these).

| Tool            | Actions                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `git_context`   | `summary` (default), `search`, `get_config`, `set_config`, `aliases`                                    |
| `git_status`    | `status` (default), `diff`, `diff_main`                                                                 |
| `git_history`   | `log` (default), `show`, `reflog`, `blame`, `lg`, `who`                                                 |
| `git_commits`   | `add`, `restore`, `commit`, `reset`, `revert`, `undo`, `nuke`, `wip`, `unstage`, `amend`                |
| `git_branches`  | `list` (default), `create`, `delete`, `rename`, `checkout`, `set_upstream`, `recent`                    |
| `git_remotes`   | `list` (default), `manage`, `fetch`, `pull`, `push`                                                     |
| `git_workspace` | `stash`, `stash_all`, `rebase`, `cherry_pick`, `merge`, `bisect`, `tag`, `worktree`, `submodule`        |
| `git_flow`      | `operation=init/overview/config/topic/control`                                                          |
| `git_lfs`       | `track`, `untrack`, `ls-files`, `status`, `pull`, `push`, `install`, `migrate-import`, `migrate-export` |
| `git_docs`      | `search`, `man`                                                                                         |
| `git_ping`      | _(health check)_                                                                                        |

See `references/tooling-map.md` for full parameter details.

## Recommended Workflow

### Everyday feature work

1. Orient with `git_context action=summary`
2. Inspect with `git_status action=status`, `git_status action=diff`, `git_history action=log`
3. Create or switch branches with `git_branches action=create` or `git_branches action=checkout`
4. Stage with `git_commits action=add`
5. Commit with `git_commits action=commit message="feat: ..."` using Conventional Commit messages
6. Sync with `git_remotes action=fetch`, `git_remotes action=pull`, `git_remotes action=push`
7. Prepare reviewable history with `git_workspace action=rebase` only if safe and explicitly appropriate

### Advanced work

- `git_workspace action=stash_all` — quick context switch without a commit
- `git_workspace action=rebase` — branch cleanup or rebasing onto upstream
- `git_workspace action=cherry_pick` — backports and targeted fixes
- `git_workspace action=bisect` — regression hunting
- `git_workspace action=worktree` — parallel branch work without stashing
- `git_workspace action=merge` — merge branches with full flag control
- `git_workspace action=tag` — release tags
- `git_workspace action=submodule` — embedded repositories
- `git_lfs` — large binary assets
- `git_flow` — scheduled release workflows, preset init, flow overview/config inspection, config CRUD, and finish recovery

## Tool Selection

Read `references/tooling-map.md` for the MCP-first command mapping.

## Playbooks

Read `references/workflow-playbooks.md` for:

- simple feature branch flow
- review-fix and safe rebase flow
- recovery after a bad reset or rebase
- worktree setup guidance
- backport and release tagging playbooks
- hooks and CI guidance

## Git Concepts to Explain Clearly

When the user needs explanation rather than action, anchor your answer in these concepts:

- working tree, index, and committed history
- branches as movable refs
- `HEAD` as the current pointer
- fast-forward versus merge commit history
- local-only history rewriting versus shared history preservation
- reflog as the recovery ledger

Explain the concept using the MCP tool that reveals it:

- status and staging area: `git_status action=status`, `git_status action=diff`, `git_commits action=add`, `git_commits action=restore`
- refs and branch movement: `git_history action=log`, `git_history action=show`, `git_branches action=list`, `git_history action=reflog`
- merge and rebase state: `git_context action=summary`, `git_workspace action=rebase`, `git_workspace action=cherry_pick`

## Repository-Specific Notes for `git-mcp`

When contributing to this repository itself:

- Use Conventional Commits
- Prefer the documented tool groups in `docs/tools/`
- Run the full gate before declaring work done:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm format:check`
  - `pnpm test`
- Remember that the project uses `simple-git`, Zod schemas, and safety-first defaults

## References

- `references/tooling-map.md`
- `references/workflow-playbooks.md`
- `docs/tools/index.md`
- `docs/guide/safety.md`
- `docs/development/contributing.md`
