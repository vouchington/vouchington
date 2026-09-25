export type JscpdCliOptions = {
  base: string | undefined
}

const USAGE = 'Usage: node static-code-analysis/run-jscpd.mts [--base <ref>]'

export function parseJscpdCliArgs(args: string[]): JscpdCliOptions {
  if (args.length === 0) return { base: undefined }
  const [flag, ref] = args
  if (args.length === 2 && flag === '--base' && ref && !ref.startsWith('-')) return { base: ref }
  throw new Error(`Unknown jscpd arguments: ${args.join(' ')}\n${USAGE}`)
}

// A stacked pull request's GITHUB_BASE_REF is its parent branch. merge_group, workflow_dispatch,
// and local runs have no GITHUB_BASE_REF and compare against main.
export function selectBaseRef(
  options: JscpdCliOptions,
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (options.base) return options.base
  if (env.GITHUB_BASE_REF) return `origin/${env.GITHUB_BASE_REF}`
  return 'origin/main'
}
