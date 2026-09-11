import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const TOOLING_DEPENDENCY_CRUISER_ROOTS = [
  'ci',
  'dev/agent-issue-labels',
  'dev/pr-description.mts',
  'dev/pr-description',
  'static-code-analysis',
] as const

type CliOptions = {
  cache: boolean
}

type DependencyCruiserExecutor = (
  command: string,
  args: string[],
  options: { shell: false; stdio: 'inherit' },
) => { error?: Error; status: number | null }

export function parseToolingDependencyCruiserCliArgs(args: string[]): CliOptions {
  if (args.length === 0) return { cache: false }
  if (args.length === 1 && args[0] === '--cache') return { cache: true }
  throw new Error(`Unknown tooling dependency-cruiser argument: ${args[0] ?? ''}`)
}

export function buildToolingDependencyCruiserArgs(options: CliOptions): string[] {
  return [
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'err',
    ...(options.cache ? ['--cache', '--cache-strategy', 'content'] : []),
    ...TOOLING_DEPENDENCY_CRUISER_ROOTS,
  ]
}

export function runToolingDependencyCruiser(
  args: string[],
  execute: DependencyCruiserExecutor = spawnSync,
): number {
  const options = parseToolingDependencyCruiserCliArgs(args)
  const result = execute(
    'pnpm',
    ['exec', 'depcruise', ...buildToolingDependencyCruiserArgs(options)],
    { shell: false, stdio: 'inherit' },
  )
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runToolingDependencyCruiser(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
