export type JscpdCliOptions = {
  base: string | undefined
}

export type JscpdBaseline =
  | { kind: 'merge-base'; ref: string }
  | { kind: 'pull-request-merge-parent' }

const USAGE = 'Usage: node static-code-analysis/run-jscpd.mts [--base <ref>]'

export function parseJscpdCliArgs(args: string[]): JscpdCliOptions {
  if (args.length === 0) return { base: undefined }
  const [flag, ref] = args
  if (args.length === 2 && flag === '--base' && ref && !ref.startsWith('-')) return { base: ref }
  throw new Error(`Unknown jscpd arguments: ${args.join(' ')}\n${USAGE}`)
}

// A pull_request run checks out GitHub's merge commit, whose first parent is the tree GitHub merged
// the branch into: the base branch tip, or for a native stack layer, main plus every lower layer.
// GITHUB_BASE_REF names main on every stack layer, so it cannot stand in for that parent.
// merge_group, workflow_dispatch, and local runs compare against main.
export function selectBaseline(
  options: JscpdCliOptions,
  env: Readonly<Record<string, string | undefined>>,
): JscpdBaseline {
  if (options.base) return { kind: 'merge-base', ref: options.base }
  if (env.GITHUB_EVENT_NAME === 'pull_request') return { kind: 'pull-request-merge-parent' }
  return { kind: 'merge-base', ref: 'origin/main' }
}
