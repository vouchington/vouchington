import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createDeps, type DepsOptions } from './deps.mts'
import { errorMessage } from './messages.mts'
import { run, type RunMode } from './run.mts'
import { watchSignals } from './signals.mts'

const REPO_ROOT = resolve(import.meta.dirname, '../..')

export const parseMode = (argv: readonly string[]): RunMode =>
  parseArgs({ allowPositionals: false, args: [...argv], options: { update: { type: 'boolean' } } })
    .values.update
    ? 'update'
    : 'check'

/**
 * Entry point: `[--update]` rewrites the baseline instead of comparing against it. Returns the
 * process exit status; every failure is printed to stderr and reported as status 1.
 */
export async function main(
  argv: readonly string[],
  overrides: Partial<Omit<DepsOptions, 'abort'>> = {},
): Promise<number> {
  const watch = watchSignals()
  const error = overrides.error ?? console.error
  try {
    const deps = createDeps({ root: REPO_ROOT, ...overrides, abort: watch.abort })
    return await run(parseMode(argv), deps)
  } catch (failure) {
    error(`knip production-exports failed: ${errorMessage(failure)}`)
    return 1
  } finally {
    watch.dispose()
  }
}
