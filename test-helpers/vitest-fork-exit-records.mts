// Durable, file-based twin of the `[vitest-fork-exit]` stderr line written by
// vitest-fork-exit-sentinel.mts. That line answers "how did this fork die"; this file answers a
// question the stderr line structurally cannot: "how many forks ran at all". Fork stderr is piped
// to the main process asynchronously (ForksPoolWorker.start()'s `this._fork.stderr.pipe(...)`) and
// is lost on an abrupt kill before the pipe drains, but a fork that dies *before writing anything*
// leaves no trace on that pipe either way — there is nothing to be "lost". Only a record written at
// fork start, independent of how the fork ends, lets a reader compute forks-without-an-exit-record.
//
// Each fork writes to its own `<pid>.jsonl` file so concurrent forks never contend for one shared
// file offset. Every write uses the same synchronous fd write as the stderr sentinel line, for the
// same durability reason: it must survive everything short of SIGKILL/SIGSEGV/a hard V8 abort.
import { mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeInlineErrorMessage } from './vitest-fork-exit-error-detail.mts'

export const forkExitSentinelDirectory =
  process.env.VITEST_FORK_EXIT_SENTINEL_DIR ?? '.vitest-reports/fork-exit-sentinel'

export type ForkExitRecordMode = 'exit' | 'uncaught' | 'unhandled' | `signal:${NodeJS.Signals}`

export type ForkExitSentinelRecord =
  | { kind: 'start'; pid: number }
  | {
      kind: 'exit'
      pid: number
      project: string
      module: string
      mode: ForkExitRecordMode
      code: number
      // Populated only for mode 'uncaught'/'unhandled' — see vitest-fork-exit-error-detail.mts.
      errorMessage?: string
      errorStack?: string
    }

let recordFileFd: number | null = null

function recordFileDescriptor(): number | null {
  if (recordFileFd !== null) return recordFileFd
  try {
    mkdirSync(forkExitSentinelDirectory, { recursive: true })
    recordFileFd = openSync(join(forkExitSentinelDirectory, `${process.pid}.jsonl`), 'a')
    return recordFileFd
  } catch {
    // Best-effort: a read-only or missing directory must not turn attribution into a crash. The
    // fd-2 [vitest-fork-exit] line stays the primary signal; this file is a durable supplement.
    return null
  }
}

export function writeForkExitRecord(record: ForkExitSentinelRecord): void {
  const fd = recordFileDescriptor()
  if (fd === null) return
  try {
    writeSync(fd, `${JSON.stringify(record)}\n`)
  } catch {
    // Same best-effort rationale as recordFileDescriptor() above.
  }
}

export function readForkExitRecords(
  dir: string = forkExitSentinelDirectory,
): ForkExitSentinelRecord[] {
  let filenames: string[]
  try {
    filenames = readdirSync(dir)
  } catch {
    return []
  }

  const records: ForkExitSentinelRecord[] = []
  for (const filename of filenames) {
    if (!filename.endsWith('.jsonl')) continue
    parseRecordLines(readFileSafely(join(dir, filename)), records)
  }
  return records
}

export function clearForkExitRecords(dir: string = forkExitSentinelDirectory): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best-effort reset between runs; a missing directory is already the goal state.
  }
}

export interface ForkExitRecordSummary {
  startedPidCount: number
  exitRecords: Extract<ForkExitSentinelRecord, { kind: 'exit' }>[]
  forksWithoutExitSentinel: number
}

export function summarizeForkExitRecords(records: ForkExitSentinelRecord[]): ForkExitRecordSummary {
  const startedPids = new Set<number>()
  const exitRecordsByPid = new Map<number, Extract<ForkExitSentinelRecord, { kind: 'exit' }>>()
  for (const record of records) {
    if (record.kind === 'start') startedPids.add(record.pid)
    else exitRecordsByPid.set(record.pid, record)
  }
  const forksWithoutExitSentinel = [...startedPids].filter(pid => !exitRecordsByPid.has(pid)).length
  return {
    startedPidCount: startedPids.size,
    exitRecords: [...exitRecordsByPid.values()],
    forksWithoutExitSentinel,
  }
}

const MAX_SENTINEL_EXIT_RECORDS = 20

// Consumed by vitest-worker-exit-diagnostics-reporter.mts's onTestRunEnd — kept here rather than
// there so the record shape and its presentation stay next to each other.
export function formatForkExitSentinelSection(summary: ForkExitRecordSummary): string[] {
  const lines = [
    `forks started: ${summary.startedPidCount}`,
    `forks without an exit sentinel: ${summary.forksWithoutExitSentinel}`,
    'sentinel exit records:',
  ]
  if (summary.exitRecords.length === 0) {
    lines.push('  (none recorded)')
    return lines
  }
  for (const record of summary.exitRecords.slice(0, MAX_SENTINEL_EXIT_RECORDS)) {
    lines.push(
      `  - pid=${record.pid} project=${record.project} module=${record.module} mode=${record.mode} code=${record.code}`,
    )
    // sanitizeInlineErrorMessage collapses the record's raw, unbounded message to one line: this
    // report is written straight into the CI job log the transient-retry classifier scans
    // (ci/transient-retry/backend-test-rules.mts's line-anchored `Error: [vitest-pool]: Worker
    // forks emitted error.` / `Caused by: Error: Worker exited unexpectedly` patterns), so a raw
    // multi-line Error.message could otherwise forge a fresh anchored line and collide with them —
    // the same collision class documented for diagnostic-report JSON in
    // docs/development/reference-vitest-worker-exit-diagnostics.md.
    if (record.errorMessage)
      lines.push(`    error: ${sanitizeInlineErrorMessage(record.errorMessage)}`)
    if (record.errorStack)
      lines.push(`    stack: ${sanitizeInlineErrorMessage(record.errorStack.slice(0, 500))}`)
  }
  if (summary.exitRecords.length > MAX_SENTINEL_EXIT_RECORDS) {
    lines.push(`  ... ${summary.exitRecords.length - MAX_SENTINEL_EXIT_RECORDS} more`)
  }
  return lines
}

function readFileSafely(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function parseRecordLines(content: string, into: ForkExitSentinelRecord[]): void {
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      into.push(JSON.parse(line) as ForkExitSentinelRecord)
    } catch {
      // A torn trailing line from a fork still mid-write when this is read; skip it rather than
      // fail the whole roll-up over one partial record.
    }
  }
}
