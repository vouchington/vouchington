import { diffFindings, parseBaseline, serializeBaseline } from './baseline.mts'
import { errorMessage, formatDiffFailure, formatOk, formatUpdated } from './messages.mts'
import type { ProcessResult } from './process.mts'
import { parseKnipReport, type Finding } from './report.mts'
import { exitCodeForSignal } from './signals.mts'

export type RunMode = 'check' | 'update'

/** Everything with side effects, so the decision logic runs against synthetic knip output. */
export interface RunDeps {
  abort: AbortSignal
  error: (text: string) => void
  /** Formats the generated baseline the way the repository formatter would. */
  formatBaseline: (text: string) => Promise<string>
  info: (text: string) => void
  /** Rejects with an actionable message when the baseline file is missing. */
  readBaseline: () => Promise<string>
  runKnip: (abort: AbortSignal) => Promise<ProcessResult>
  /** Runs the callback with the test files deleted, restoring them afterwards. */
  withTestFilesRemoved: (fn: () => Promise<ProcessResult>) => Promise<ProcessResult>
  writeBaseline: (text: string) => Promise<void>
}

const MAX_OUTPUT_CHARS = 4000

function knipFailure(result: ProcessResult): string | undefined {
  if (result.error) return `knip could not be started: ${result.error.message}`
  if (result.signal) return `knip was terminated by ${result.signal}.`
  if (result.status === 0) return undefined
  return `knip exited with status ${result.status}.`
}

/** Appends knip's own diagnostics, which are the only clue when knip fails rather than reports. */
function withOutput(message: string, result: ProcessResult): string {
  const output = result.stderr.trim() || result.stdout.trim()
  if (output === '') return message
  const shown = output.length > MAX_OUTPUT_CHARS ? `...${output.slice(-MAX_OUTPUT_CHARS)}` : output
  return `${message}\nknip output:\n${shown}`
}

function readFindings(result: ProcessResult): Finding[] {
  const failure = knipFailure(result)
  if (failure) throw new Error(withOutput(failure, result))
  try {
    return parseKnipReport(result.stdout)
  } catch (error) {
    throw new Error(withOutput(errorMessage(error), result), { cause: error })
  }
}

async function check(findings: readonly Finding[], deps: RunDeps): Promise<number> {
  const diff = diffFindings(findings, parseBaseline(await deps.readBaseline()))
  if (diff.added.length === 0 && diff.removed.length === 0) {
    deps.info(formatOk(findings.length))
    return 0
  }
  deps.error(formatDiffFailure(diff))
  return 1
}

async function update(findings: readonly Finding[], deps: RunDeps): Promise<number> {
  await deps.writeBaseline(await deps.formatBaseline(serializeBaseline(findings)))
  deps.info(formatUpdated(findings.length, new Set(findings.map(({ file }) => file)).size))
  return 0
}

/**
 * Returns the process exit status: 0 when the baseline matches (or was rewritten), 1 for new or
 * stale findings, and 128 plus the signal number when interrupted. Knip crashes, unusable output,
 * a missing baseline, and refusal to run all reject with a message instead, never as a mismatch.
 */
export async function run(mode: RunMode, deps: RunDeps): Promise<number> {
  const result = await deps.withTestFilesRemoved(() => deps.runKnip(deps.abort))
  if (deps.abort.aborted) {
    deps.error(
      `knip production-exports: interrupted by ${String(deps.abort.reason)}; test files restored.`,
    )
    return exitCodeForSignal(deps.abort.reason)
  }
  const findings = readFindings(result)
  return mode === 'update' ? update(findings, deps) : check(findings, deps)
}
