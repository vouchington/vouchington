import { readFileSync } from 'node:fs'
import { BACKEND_UNIT_FILE_PROGRESS_PREFIX } from '../test-helpers/vitest-file-progress-reporter.mts'

const EVENT_PATTERN = /^event=(start|finish) module=("(?:[^"\\]|\\.)*")/u

/** Returns the modules whose start was logged without a later finish, in start order. */
export function unfinishedFiles(progress: string): string[] {
  const open = new Set<string>()
  for (const line of progress.split('\n')) {
    if (!line.startsWith(`${BACKEND_UNIT_FILE_PROGRESS_PREFIX} `)) continue
    const match = EVENT_PATTERN.exec(line.slice(BACKEND_UNIT_FILE_PROGRESS_PREFIX.length + 1))
    if (!match) continue
    const moduleId = JSON.parse(match[2] ?? '""') as string
    if (match[1] === 'start') open.add(moduleId)
    else open.delete(moduleId)
  }
  return [...open]
}

export function formatDeadlineReport(progress: string): string {
  const files = unfinishedFiles(progress)
  const lines = [`[backend-unit-deadline] ${files.length} test file(s) started and not finished`]
  for (const file of files) lines.push(`[backend-unit-deadline] unfinished ${file}`)
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
