import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { format } from 'oxfmt'
import { BaselineError } from './baseline.mts'
import { BASELINE_PATH, KNIP_ARGS, KNIP_BIN, UPDATE_COMMAND } from './config.mts'
import { createGit } from './git.mts'
import { formatTestFilesRemoved } from './messages.mts'
import { runProcess } from './process.mts'
import type { RunDeps } from './run.mts'
import { withTestFilesRemoved } from './test-files.mts'

export interface DepsOptions {
  abort: AbortSignal
  error?: (text: string) => void
  info?: (text: string) => void
  /** Node script and arguments that print knip's JSON report; defaults to the repository knip. */
  knip?: { args: readonly string[]; bin: string }
  /** Repository root: git, knip and the baseline are all resolved from here. */
  root: string
}

async function formatBaseline(text: string): Promise<string> {
  const { code, errors } = await format(BASELINE_PATH, text)
  if (errors.length > 0) {
    throw new Error(`oxfmt could not format the baseline: ${errors.map(e => e.message).join('; ')}`)
  }
  return code
}

/** The real filesystem, git and knip behind {@link RunDeps}. */
export function createDeps(options: DepsOptions): RunDeps {
  const { abort, root, knip = { args: KNIP_ARGS, bin: KNIP_BIN } } = options
  const info = options.info ?? console.log
  const git = createGit(root)
  const baselineFile = join(root, BASELINE_PATH)
  return {
    abort,
    error: options.error ?? console.error,
    formatBaseline,
    info,
    readBaseline: () =>
      readFile(baselineFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
        throw new BaselineError(
          `${BASELINE_PATH} does not exist. Create it with: ${UPDATE_COMMAND}`,
        )
      }),
    runKnip: signal =>
      runProcess(process.execPath, [knip.bin, ...knip.args], { abort: signal, cwd: root }),
    withTestFilesRemoved: fn =>
      withTestFilesRemoved(
        {
          git,
          onRemoved: count => info(formatTestFilesRemoved(count)),
          remove: file => rm(join(root, file), { force: true }),
        },
        fn,
      ),
    writeBaseline: text => writeFile(baselineFile, text),
  }
}
