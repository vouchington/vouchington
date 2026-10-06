import { writeSync } from 'node:fs'
import type { Reporter, TestModule } from 'vitest/node'

export const BACKEND_UNIT_FILE_PROGRESS_PREFIX = '[backend-unit-file]'
const MAX_MODULE_ID_CHARS = 400

export type BackendUnitFileProgressEvent = 'start' | 'finish'

type WriteProgress = (chunk: string) => void

function moduleId(testModule: TestModule): string {
  return testModule.relativeModuleId || testModule.moduleId
}

export function formatBackendUnitFileProgress(
  event: BackendUnitFileProgressEvent,
  moduleId: string,
  state?: string,
): string {
  let boundedModuleId = moduleId.slice(0, MAX_MODULE_ID_CHARS)
  if (boundedModuleId.length < moduleId.length) {
    boundedModuleId = `${boundedModuleId.slice(0, -1)}…`
  }
  const stateToken = state !== undefined && /^[a-z]+$/u.test(state) ? ` state=${state}` : ''
  return `${BACKEND_UNIT_FILE_PROGRESS_PREFIX} event=${event} module=${JSON.stringify(boundedModuleId)}${stateToken}\n`
}

class VitestFileProgressReporter implements Reporter {
  private readonly write: WriteProgress

  constructor(write: WriteProgress) {
    this.write = write
  }

  onTestModuleQueued(testModule: TestModule): void {
    // Queued fires when a worker takes the file, before import. A shard that dies
    // during that file still has this line; the CI minimal reporter prints nothing.
    this.write(formatBackendUnitFileProgress('start', moduleId(testModule)))
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.write(formatBackendUnitFileProgress('finish', moduleId(testModule), testModule.state()))
  }
}

function writeProgressLine(chunk: string): void {
  writeSync(process.stdout.fd, chunk)
}

export function createVitestFileProgressReporter(
  write: WriteProgress = writeProgressLine,
): VitestFileProgressReporter {
  return new VitestFileProgressReporter(write)
}

export function isBackendUnitFileProgressReporter(
  reporter: unknown,
): reporter is VitestFileProgressReporter {
  return reporter instanceof VitestFileProgressReporter
}
