import { execFileSync } from 'node:child_process'

import type { BlockDecision } from './core.mts'
import { lastNamedOption } from './github-option-flags.mts'

const GIT_WORKTREE_OVERRIDE_ENV = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
])

export function gitEnvForCwd(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !GIT_WORKTREE_OVERRIDE_ENV.has(key)),
  )
}

function gitText(cwd: string, args: string[]): string | undefined {
  try {
    const text = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: gitEnvForCwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim()
    return text === '' ? undefined : text
  } catch {
    return undefined
  }
}

// `git merge-base --is-ancestor` is exit-code-only: 0 = ancestor, 1 = provably not, anything else
// (128 for an unknown ref, a timeout, git missing) is indeterminate. gitText can't distinguish "1"
// from "128" — both throw and both come back undefined — so this fails open on genuine errors
// while still resolving the true/false case the caller needs to block on.
function gitIsAncestor(cwd: string, ancestor: string, descendant: string): boolean | undefined {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd,
      env: gitEnvForCwd(),
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 5_000,
    })
    return true
  } catch (error) {
    return (error as { status?: number | null }).status === 1 ? false : undefined
  }
}

/**
 * Effective base `gh pr create` uses when `--base`/`-B` is omitted:
 * `branch.<current>.gh-merge-base`, else undefined (repo default).
 */
export function configuredPullRequestBase(cwd: string): string | undefined {
  const branch = gitText(cwd, ['branch', '--show-current'])
  if (branch === undefined) {
    return undefined
  }
  return gitText(cwd, ['config', '--get', `branch.${branch}.gh-merge-base`])
}

export function currentBranchName(cwd: string): string | undefined {
  return gitText(cwd, ['branch', '--show-current'])
}

/**
 * Root guard for `gh stack init` (plan #11426/#11439): a stack rooted off trunk cannot drain if
 * its base branch is ever abandoned (#11376, #11352 both rooted this way). Scoped to `init` only —
 * `gh stack add` only appends to an existing, already-validated stack.
 */
export function findStackInitBaseBlock(optionTokens: string[], cwd: string): BlockDecision | null {
  const base = lastNamedOption(optionTokens, 'base', 'b')
  if (base !== undefined && base !== 'main') {
    return {
      reason:
        'gh stack init must root on main, not an unmerged branch — omit --base/-b (it defaults ' +
        'to the repo default branch) or pass --base main. See .agents/skills/stacked-prs/SKILL.md.',
    }
  }
  if (gitIsAncestor(cwd, 'HEAD', 'origin/main') === false) {
    return {
      reason:
        'gh stack init must run from a commit already merged into origin/main (HEAD is not an ' +
        'ancestor of origin/main) — check out an up-to-date main before initializing a stack. ' +
        'See .agents/skills/stacked-prs/SKILL.md.',
    }
  }
  return null
}

export function findHandRolledStackBaseBlock(
  action: string,
  optionTokens: string[],
  cwd: string,
): BlockDecision | null {
  const base = lastNamedOption(optionTokens, 'base', 'B')
  const effectiveBase =
    base ?? (action === 'create' || action === 'new' ? configuredPullRequestBase(cwd) : undefined)
  if (effectiveBase === undefined || effectiveBase === 'main') {
    return null
  }
  return {
    reason:
      'PRs must target main unless they are part of a native GitHub stack. Use `gh stack`, not `gh pr create/edit --base <unmerged-branch>`.',
  }
}
