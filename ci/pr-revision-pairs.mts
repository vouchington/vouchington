import { execFileSync } from 'node:child_process'

/**
 * Allowed GitHub `pull_request` revision pairs for changed-path diffs.
 *
 * Pair 1: `pull_request.base.sha` vs `pull_request.head.sha` (the PR object /
 * GitHub Files changed list).
 * Pair 2: `origin/${GITHUB_BASE_REF}` vs `HEAD` after checking out
 * `refs/pull/N/merge` (merge parent vs merge commit). Both trees already
 * contain current `main`, so already-merged main files cancel out.
 *
 * Mixing `pull_request.base.sha` with `github.sha` is forbidden: the recorded
 * base SHA can lag the merge parent, so the diff includes commits that already
 * landed on main (#11711).
 */
export type Pair2Revisions = {
  base: string
  head: string
}

export function pair2BaseRef(baseBranch: string): string {
  return `origin/${baseBranch}`
}

function revParse(worktreeRoot: string, spec: string): string {
  try {
    return execFileSync('git', ['-C', worktreeRoot, 'rev-parse', '--verify', spec], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`git rev-parse --verify ${spec} failed: ${detail}`, { cause: error })
  }
}

export function resolvePair2Revisions(worktreeRoot: string, baseBranch: string): Pair2Revisions {
  return {
    base: revParse(worktreeRoot, `${pair2BaseRef(baseBranch)}^{commit}`),
    head: revParse(worktreeRoot, 'HEAD^{commit}'),
  }
}
