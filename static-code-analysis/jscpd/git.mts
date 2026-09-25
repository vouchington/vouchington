import type { JscpdBaseline } from './cli.mts'
import { describeFailure, runProcess, type JscpdRunContext } from './process.mts'

// Joined from parts so this file and its tests never contain the markers they ban.
export const INLINE_IGNORE_MARKERS = ['start', 'end'].map(edge =>
  ['jscpd', `ignore-${edge}`].join(':'),
)

function git(context: JscpdRunContext, args: string[]): string {
  const result = runProcess(context, 'git', args)
  if (result.status !== 0) throw new Error(describeFailure('git', args, result))
  return result.stdout
}

function splitNul(output: string): string[] {
  return output.split('\0').filter(entry => entry.length > 0)
}

export function listTrackedFiles(context: JscpdRunContext): string[] {
  return splitNul(git(context, ['ls-files', '-z']))
}

// Untracked, non-ignored paths. A nested repository or worktree is reported once as `dir/`.
export function listUntrackedPaths(context: JscpdRunContext): string[] {
  return splitNul(git(context, ['ls-files', '--others', '--exclude-standard', '-z']))
}

export type ResolvedBaseline = { commit: string; label: string }

function resolveMergeBase(context: JscpdRunContext, baseRef: string): string {
  const args = ['merge-base', baseRef, 'HEAD']
  const result = runProcess(context, 'git', args)
  if (result.status === 0) return result.stdout.trim()
  throw new Error(
    [
      `Cannot resolve the jscpd baseline: ${describeFailure('git', args, result)}`,
      'Fetch the base ref (CI: the fetch-base-ref action; local: `git fetch origin main`),',
      'or pass `--base <parent-branch>` on a stacked branch: `pnpm run jscpd --base <parent-branch>`.',
    ].join('\n'),
  )
}

// The first parent of GitHub's pull_request merge commit is an ancestor of HEAD, so it is its own
// merge-base. A shallow checkout lists no parents, which fails here instead of scanning wrongly.
function resolvePullRequestMergeParent(context: JscpdRunContext): string {
  const [, ...parents] = git(context, ['rev-list', '--parents', '-n', '1', 'HEAD'])
    .trim()
    .split(' ')
  const [firstParent] = parents
  if (parents.length === 2 && firstParent) return firstParent
  throw new Error(
    [
      `Cannot resolve the jscpd baseline: a pull_request run compares against the first parent of GitHub's merge commit, but HEAD has ${parents.length} parent(s).`,
      'Check out the default pull_request ref (refs/pull/<number>/merge) and run the fetch-base-ref action before jscpd so its history is not shallow.',
    ].join('\n'),
  )
}

export function resolveBaseline(
  context: JscpdRunContext,
  baseline: JscpdBaseline,
): ResolvedBaseline {
  if (baseline.kind === 'pull-request-merge-parent') {
    const commit = resolvePullRequestMergeParent(context)
    return { commit, label: `pull request merge parent ${commit.slice(0, 12)} (HEAD^1)` }
  }
  const commit = resolveMergeBase(context, baseline.ref)
  return { commit, label: `merge-base ${commit.slice(0, 12)} (${baseline.ref})` }
}

// Tracked non-Markdown files containing an inline ignore marker, as `file:line`. Markdown is
// excluded because documentation names the markers; jscpd does not scan Markdown here.
export function findInlineIgnoreMarkers(context: JscpdRunContext): string[] {
  const args = [
    'grep',
    '-n',
    '-z',
    '-I',
    '-F',
    ...INLINE_IGNORE_MARKERS.flatMap(marker => ['-e', marker]),
    '--',
    '.',
    ':(exclude,glob)**/*.md',
  ]
  const result = runProcess(context, 'git', args)
  if (result.status === 1) return []
  if (result.status !== 0) throw new Error(describeFailure('git', args, result))
  return result.stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const [file, lineNumber] = line.split('\0')
      return `${file}:${lineNumber}`
    })
}
