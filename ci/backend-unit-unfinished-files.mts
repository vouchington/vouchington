import { readFileSync } from 'node:fs'
import { BACKEND_UNIT_FILE_PROGRESS_PREFIX } from '../test-helpers/vitest-file-progress-reporter.mts'

const EVENT_PATTERN =
  /^event=(start|finish) module=("(?:[^"\\]|\\.)*")(?: state=[a-z]+)?(?: at=(\d+))?$/u
const SLOWEST_FINISHED_COUNT = 5

type FileProgress = { unfinished: Map<string, number | undefined>; finishedMs: [string, number][] }

function readProgress(progress: string): FileProgress {
  const unfinished = new Map<string, number | undefined>()
  const finishedMs: [string, number][] = []
  for (const line of progress.split('\n')) {
    if (!line.startsWith(`${BACKEND_UNIT_FILE_PROGRESS_PREFIX} `)) continue
    const match = EVENT_PATTERN.exec(line.slice(BACKEND_UNIT_FILE_PROGRESS_PREFIX.length + 1))
    if (!match) continue
    const moduleId = JSON.parse(match[2] ?? '""') as string
    const at = match[3] === undefined ? undefined : Number(match[3])
    if (match[1] === 'start') {
      unfinished.set(moduleId, at)
      continue
    }
    const startedAt = unfinished.get(moduleId)
    if (startedAt !== undefined && at !== undefined) finishedMs.push([moduleId, at - startedAt])
    unfinished.delete(moduleId)
  }
  return { unfinished, finishedMs }
}

/** Returns the modules whose start was logged without a later finish, in start order. */
export function unfinishedFiles(progress: string): string[] {
  return [...readProgress(progress).unfinished.keys()]
}

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`
}

/**
 * A file that is merely in flight at the deadline looks the same as a stuck one, so the report
 * adds how long each unfinished file has been running and which finished files took longest.
 */
export function formatDeadlineReport(
  progress: string,
  label = 'backend-unit-deadline',
  nowMs = Date.now(),
): string {
  const { unfinished, finishedMs } = readProgress(progress)
  const lines = [`[${label}] ${unfinished.size} test file(s) started and not finished`]
  for (const [file, startedAt] of unfinished) {
    const running = startedAt === undefined ? '' : ` (running ${seconds(nowMs - startedAt)})`
    lines.push(`[${label}] unfinished ${file}${running}`)
  }
  const slowest = finishedMs.toSorted((a, b) => b[1] - a[1]).slice(0, SLOWEST_FINISHED_COUNT)
  for (const [file, ms] of slowest) lines.push(`[${label}] slowest finished ${seconds(ms)} ${file}`)
  return `${lines.join('\n')}\n`
}

if (import.meta.main) {
  const progressFile = process.argv[2]
  let progress = ''
  try {
    progress = progressFile ? readFileSync(progressFile, 'utf8') : ''
  } catch {
    process.stdout.write('[backend-unit-deadline] no file progress was recorded\n')
    process.exit(0)
  }
  process.stdout.write(formatDeadlineReport(progress))
}
