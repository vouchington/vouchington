import { gitConfigValue, gitCurrentBranch, gitIsAncestor } from '../local-process.mts'
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
 * no checkout; only the HEAD ancestry check reads `cwd`, so an unknown `cwd` skips just that.
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
