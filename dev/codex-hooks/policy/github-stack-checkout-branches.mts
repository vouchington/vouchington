import { spawnSync } from 'node:child_process'

import { gitEnvForCwd } from './github-configured-base.mts'

export type CheckoutLayer = { pr: number; ref: string; sha: string }

const SHA_PATTERN = /^[0-9a-f]{40}$/

// Git allows `$`, `(`, `)`, and backticks in branch names, so a generated command interpolates only
// a name that is inert in a shell and cannot read as an option or a forced (`+`) refspec.
const SHELL_SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

type GitRun = { status: number; stdout: string }

// Every call shares the guard's deadline, because a hook that outlives the harness timeout does not
// block: a call that cannot finish in time never starts, and one that overruns is killed. Undefined
// means git did not produce an exit status.
function runGit(cwd: string, args: string[], deadline: number): GitRun | undefined {
  const timeout = deadline - Date.now()
  if (timeout <= 0) {
    return undefined
  }
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitEnvForCwd(),
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout,
  })
  return result.error === undefined && result.status !== null
    ? { status: result.status, stdout: result.stdout.trim() }
    : undefined
}

// gh-stack's own existence check (cli/cli's HasLocalBranch: `git rev-parse --verify
// refs/heads/<branch>`), so a differently cased loose ref on a case-insensitive filesystem counts
// here exactly when gh-stack would keep it. Null is "no such branch" (exit 1); undefined is a
// branch the hook could not read.
function localBranchHead(cwd: string, ref: string, deadline: number): string | null | undefined {
  const result = runGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`], deadline)
  if (result?.status === 0 && SHA_PATTERN.test(result.stdout)) {
    return result.stdout
  }
  return result?.status === 1 ? null : undefined
}

// git refuses to fetch into a branch checked out in any worktree, so a checked-out layer is
// fast-forwarded from inside that worktree instead.
function checkedOutWorktrees(cwd: string, deadline: number): Map<string, string> {
  const worktrees = new Map<string, string>()
  let worktree = ''
  for (const line of runGit(cwd, ['worktree', 'list', '--porcelain'], deadline)?.stdout.split(
    '\n',
  ) ?? []) {
    if (line.startsWith('worktree ')) {
      worktree = line.slice('worktree '.length)
    } else if (line.startsWith('branch refs/heads/')) {
      worktrees.set(line.slice('branch refs/heads/'.length), worktree)
    }
  }
  return worktrees
}

// Only a provable fast-forward gets a generated command. Anything else, including a comparison the
// deadline cut short, may carry work that exists nowhere else (pre-rebase copies, commits from a
// closed PR), so it is left to the agent to inspect.
function staleLayerLine(
  cwd: string,
  deadline: number,
  { layer, local }: { layer: CheckoutLayer; local: string },
  worktrees: Map<string, string>,
): string {
  const label = `${JSON.stringify(layer.ref)} (PR #${layer.pr})`
  const inClone = runGit(cwd, ['cat-file', '-e', `${layer.sha}^{commit}`], deadline)
  if (inClone !== undefined && inClone.status !== 0) {
    return `- ${label}: its PR head ${layer.sha} is not in this clone yet. Run \`git fetch origin\` first.`
  }
  const behind =
    inClone !== undefined &&
    runGit(cwd, ['merge-base', '--is-ancestor', local, layer.sha], deadline)?.status === 0
  if (behind) {
    const worktree = worktrees.get(layer.ref)
    if (worktree !== undefined) {
      return `- ${label} is behind its PR head and checked out at ${worktree}. Fast-forward it in that worktree: \`git merge --ff-only ${layer.sha}\`.`
    }
    return SHELL_SAFE_REF.test(layer.ref)
      ? `- ${label} is behind its PR head. Fast-forward it: \`git fetch origin refs/heads/${layer.ref}:refs/heads/${layer.ref}\`.`
      : `- ${label} is behind its PR head ${layer.sha}. Its name is unsafe to paste into a shell, so fast-forward it to that commit by hand.`
  }
  return (
    `- ${label} has local commits that are not on its PR head (local ${local}, PR head ` +
    `${layer.sha}). Reconcile it by hand: push commits that belong on the PR, or move the branch ` +
    'to the PR head once you have confirmed they are superseded. Do not reset it unchecked.'
  )
}

/**
 * One fix line per existing local layer branch whose head differs from its PR head, or undefined
 * when any layer's branch could not be read. Only "no such branch" and "at the PR head" count as
 * clean.
 */
export function staleLayerBranches(
  cwd: string,
  layers: CheckoutLayer[],
  deadline: number,
): string[] | undefined {
  const stale: Array<{ layer: CheckoutLayer; local: string }> = []
  for (const layer of layers) {
    const local = localBranchHead(cwd, layer.ref, deadline)
    if (local === undefined) {
      return undefined
    }
    if (local !== null && local !== layer.sha) {
      stale.push({ layer, local })
    }
  }
  const worktrees = stale.length > 0 ? checkedOutWorktrees(cwd, deadline) : new Map()
  return stale.map(entry => staleLayerLine(cwd, deadline, entry, worktrees))
}
