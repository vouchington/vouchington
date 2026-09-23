import { gitIsAncestor, gitText } from './github-configured-base.mts'

export type CheckoutLayer = { pr: number; ref: string; sha: string }

const HEADS_PREFIX = 'refs/heads/'

// Git allows `$`, `(`, `)`, and backticks in branch names, so a generated command interpolates only
// a name that is inert in a shell and cannot read as an option or a forced (`+`) refspec.
const SHELL_SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

// A git failure reads as "no local branches": gh stack checkout needs the same repository, so it
// fails on its own there, and a missing branch is one gh-stack creates from the fetched remote.
function localBranchHeads(cwd: string): Map<string, string> {
  const text = gitText(cwd, ['for-each-ref', '--format=%(objectname) %(refname)', HEADS_PREFIX])
  const heads = new Map<string, string>()
  for (const line of text?.split('\n') ?? []) {
    const [sha, refname] = line.split(' ')
    heads.set(refname.slice(HEADS_PREFIX.length), sha)
  }
  return heads
}

// git refuses to fetch into a branch checked out in any worktree, so a checked-out layer is
// fast-forwarded from inside that worktree instead.
function worktreeWithBranch(cwd: string, ref: string): string | undefined {
  let worktree: string | undefined
  for (const line of gitText(cwd, ['worktree', 'list', '--porcelain'])?.split('\n') ?? []) {
    if (line.startsWith('worktree ')) {
      worktree = line.slice('worktree '.length)
    } else if (line === `branch ${HEADS_PREFIX}${ref}`) {
      return worktree
    }
  }
  return undefined
}

// Only a provable fast-forward gets a generated command. Anything else may carry work that exists
// nowhere else (pre-rebase copies, commits from a closed PR), so it is left to the agent to inspect.
function staleLayerLine(cwd: string, layer: CheckoutLayer, local: string): string {
  const label = `\`${layer.ref}\` (PR #${layer.pr})`
  if (gitText(cwd, ['cat-file', '-t', layer.sha]) !== 'commit') {
    return `- ${label}: its PR head ${layer.sha} is not in this clone yet. Run \`git fetch origin\` first.`
  }
  if (gitIsAncestor(cwd, local, layer.sha) === true) {
    const worktree = worktreeWithBranch(cwd, layer.ref)
    if (worktree !== undefined) {
      return `- ${label} is behind its PR head and checked out at ${worktree}. Fast-forward it in that worktree: \`git merge --ff-only ${layer.sha}\`.`
    }
    return SHELL_SAFE_REF.test(layer.ref)
      ? `- ${label} is behind its PR head. Fast-forward it: \`git fetch origin ${layer.ref}:${layer.ref}\`.`
      : `- ${label} is behind its PR head ${layer.sha}. Its name is unsafe to paste into a shell, so fast-forward it to that commit by hand.`
  }
  return (
    `- ${label} has local commits that are not on its PR head (local ${local}, PR head ` +
    `${layer.sha}). Reconcile it by hand: push commits that belong on the PR, or move the branch ` +
    'to the PR head once you have confirmed they are superseded. Do not reset it unchecked.'
  )
}

/** One fix line per existing local layer branch whose head differs from its PR head. */
export function staleLayerBranches(cwd: string, layers: CheckoutLayer[]): string[] {
  const heads = localBranchHeads(cwd)
  return layers.flatMap(layer => {
    const local = heads.get(layer.ref)
    return local === undefined || local === layer.sha ? [] : [staleLayerLine(cwd, layer, local)]
  })
}
