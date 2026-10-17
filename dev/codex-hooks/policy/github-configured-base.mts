import {
  gitConfigValue,
  gitCurrentBranch,
  gitIsAncestor,
  gitResolveRef,
} from '../local-process.mts'
import type { BlockDecision } from './core.mts'
import { lastNamedOption } from './github-option-flags.mts'

/**
 * Effective base `gh pr create` uses when `--base`/`-B` is omitted:
 * `branch.<current>.gh-merge-base`, else undefined (repo default).
 */
export function configuredPullRequestBase(cwd: string): string | undefined {
  const branch = gitCurrentBranch(cwd)
  if (branch === undefined) {
    return undefined
  }
  return gitConfigValue(cwd, `branch.${branch}.gh-merge-base`)
}

/**
 * Root guard for `gh stack init` (plan #11426/#11439): a stack rooted off trunk cannot drain if
 * its base branch is ever abandoned (#11376, #11352 both rooted this way). Scoped to `init` only —
 * `gh stack add` only appends to an existing, already-validated stack. An explicit `--base` needs
 * no checkout; the HEAD ancestry and local-main freshness checks read `cwd`, so an unknown `cwd`
 * skips just those. gh-stack roots the first layer at `refs/heads/main` (`git.CreateBranch(name,
 * "refs/heads/" + trunk)` in its `cmd/init.go`), never `origin/main`, so a stale local `main` (#3017)
 * misroots the stack even when HEAD passed the ancestry check. A missing local `main` is fine:
 * gh-stack creates it from the remote.
 */
export function findStackInitBaseBlock(
  optionTokens: string[],
  cwd: string | undefined,
): BlockDecision | null {
  const base = lastNamedOption(optionTokens, 'base', 'b')
  if (base !== undefined && base !== 'main') {
    return {
      reason:
        'gh stack init must root on main, not an unmerged branch — omit --base/-b (it defaults ' +
        'to the repo default branch) or pass --base main. See .agents/skills/stacked-prs/SKILL.md.',
    }
  }
  if (cwd !== undefined && gitIsAncestor(cwd, 'HEAD', 'origin/main') === false) {
    return {
      reason:
        'gh stack init must run from a commit already merged into origin/main (HEAD is not an ' +
        'ancestor of origin/main) — check out an up-to-date main before initializing a stack. ' +
        'See .agents/skills/stacked-prs/SKILL.md.',
    }
  }
  const localMain = cwd === undefined ? undefined : gitResolveRef(cwd, 'refs/heads/main')
  const remoteMain = cwd === undefined ? undefined : gitResolveRef(cwd, 'refs/remotes/origin/main')
  if (localMain !== undefined && remoteMain !== undefined && localMain !== remoteMain) {
    return {
      reason:
        'gh stack init roots the stack at local `main`, which differs from origin/main (stale ' +
        'local main). Fast-forward it first without touching another checkout: if no worktree has ' +
        'main checked out, run `git fetch origin main:main`; if main is checked out in the primary ' +
        'checkout, have that checkout fast-forward itself (`git merge --ff-only origin/main` run ' +
        'there by its owner) - never move main from this worktree, and do not check out main here. ' +
        'See .agents/skills/stacked-prs/SKILL.md.',
    }
  }
  return null
}

// An explicit `--base` needs no checkout; only the configured default reads gh's directory, so a
// `cwd` the hook cannot resolve skips just that fallback.
export function findHandRolledStackBaseBlock(
  action: string,
  optionTokens: string[],
  cwd: string | undefined,
): BlockDecision | null {
  const base = lastNamedOption(optionTokens, 'base', 'B')
  const effectiveBase =
    base ??
    (cwd !== undefined && (action === 'create' || action === 'new')
      ? configuredPullRequestBase(cwd)
      : undefined)
  if (effectiveBase === undefined || effectiveBase === 'main') {
    return null
  }
  return {
    reason:
      'PRs must target main unless they are part of a native GitHub stack. Use `gh stack`, not `gh pr create/edit --base <unmerged-branch>`.',
  }
}
