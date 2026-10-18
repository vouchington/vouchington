import { appendFileSync, writeSync } from 'node:fs'
import type { Reporter, TestModule } from 'vitest/node'

export const BACKEND_UNIT_FILE_PROGRESS_PREFIX = '[backend-unit-file]'
const MAX_MODULE_ID_CHARS = 400

export type BackendUnitFileProgressEvent = 'start' | 'finish'

type WriteProgress = (chunk: string) => void
type Clock = () => number

function moduleId(testModule: TestModule): string {
  return testModule.relativeModuleId || testModule.moduleId
}

export function formatBackendUnitFileProgress(
  event: BackendUnitFileProgressEvent,
  moduleId: string,
  state?: string,
  atMs?: number,
): string {
  let boundedModuleId = moduleId.slice(0, MAX_MODULE_ID_CHARS)
  if (boundedModuleId.length < moduleId.length) {
    boundedModuleId = `${boundedModuleId.slice(0, -1)}…`
  }
  const stateToken = state !== undefined && /^[a-z]+$/u.test(state) ? ` state=${state}` : ''
  // Epoch milliseconds, so a deadline report can tell a slow file from a stuck one.
  const atToken = atMs !== undefined && Number.isSafeInteger(atMs) ? ` at=${atMs}` : ''
  return `${BACKEND_UNIT_FILE_PROGRESS_PREFIX} event=${event} module=${JSON.stringify(boundedModuleId)}${stateToken}${atToken}\n`
}

class VitestFileProgressReporter implements Reporter {
  private readonly write: WriteProgress
  private readonly now: Clock

  constructor(write: WriteProgress, now: Clock) {
    this.write = write
    this.now = now
  }

  onTestModuleQueued(testModule: TestModule): void {
    // Queued fires when a worker takes the file, before import. A shard that dies
    // during that file still has this line; the CI minimal reporter prints nothing.
    this.write(formatBackendUnitFileProgress('start', moduleId(testModule), undefined, this.now()))
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.write(
      formatBackendUnitFileProgress('finish', moduleId(testModule), testModule.state(), this.now()),
    )
  }
}

function writeProgressLine(chunk: string): void {
  writeSync(process.stdout.fd, chunk)
}

// Appends each event to a file so a quiet CI run keeps its start/finish history without logging it.
export function createFileProgressWriter(filePath: string): WriteProgress {
  return chunk => {
    appendFileSync(filePath, chunk)
  }
}

export function createVitestFileProgressReporter(
  write: WriteProgress = writeProgressLine,
  now: Clock = Date.now,
): VitestFileProgressReporter {
  return new VitestFileProgressReporter(write, now)
}

export function isBackendUnitFileProgressReporter(
  reporter: unknown,
): reporter is VitestFileProgressReporter {
  return reporter instanceof VitestFileProgressReporter
}
