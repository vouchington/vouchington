import { EOL } from 'node:os'
import type { UserConsoleLog } from 'vitest'
import type { Reporter, SerializedError, TestModule, TestRunEndReason } from 'vitest/node'
import {
  clearForkExitRecords,
  formatForkExitSentinelSection,
  isWorkerExitError,
  readForkExitRecords,
  summarizeForkExitRecords,
  type ForkExitRecordSummary,
} from 'vouchington-tooling/vitest-diagnostics'
import { forkExitSentinelDirectory } from './vitest-fork-exit-directory.mts'
import { serializeDiagnosticsError } from './vitest-worker-exit-diagnostics-errors.mts'
import { formatTeardownOverrunDiagnostics } from './vitest-teardown-overrun-diagnostics.mts'
import { formatActiveResources, formatProcessResources } from './vitest-process-resources.mts'

export { isWorkerExitError }

const MAX_RECENT_MODULE_EVENTS = 8
const MAX_RECENT_STDERR_LINES = 12
const MAX_UNHANDLED_ERRORS = 2
const MAX_UNFINISHED_MODULES = 20
const MAX_SERIALIZED_ERROR_CHARS = 900
const MAX_STDERR_LINE_CHARS = 500

type ModuleEvent = {
  kind: 'queued' | 'started' | 'ended'
  moduleId: string
}

class VitestWorkerExitDiagnosticsReporter implements Reporter {
  private emitted = false
  private recentModuleEvents: ModuleEvent[] = []
  private recentStderrLines: string[] = []

  constructor() {
    // Cleared once, when Vitest constructs reporters, before any fork exists. Clearing again from
    // onTestRunStart would drop records from forks reused across a watch rerun.
    clearForkExitRecords(forkExitSentinelDirectory)
  }

  onTestRunStart(): void {
    this.emitted = false
    this.recentModuleEvents = []
    this.recentStderrLines = []
  }

  onTestModuleQueued(testModule: TestModule): void {
    this.recordModuleEvent('queued', testModule)
  }

  onTestModuleStart(testModule: TestModule): void {
    this.recordModuleEvent('started', testModule)
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.recordModuleEvent('ended', testModule)
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason,
  ): void {
    const workerErrors = unhandledErrors.filter(error => isWorkerExitError(error))
    if (this.emitted || workerErrors.length === 0) return

    this.emitted = true
    process.stderr.write(
      formatWorkerExitDiagnostics(
        reason,
        this.recentModuleEvents,
        this.recentStderrLines,
        workerErrors,
        unfinishedModuleIds(testModules),
        summarizeForkExitRecords(readForkExitRecords(forkExitSentinelDirectory)),
      ),
    )
  }

  // Fired by Vitest's exit() watchdog at the teardownTimeout deadline; see
  // formatTeardownOverrunDiagnostics() for why this stays separate from onTestRunEnd.
  onProcessTimeout(): void {
    process.stderr.write(formatTeardownOverrunDiagnostics())
  }

  onUserConsoleLog(log: UserConsoleLog): void {
    if (log.type !== 'stderr') return
    for (const line of log.content.split(/\r?\n/).filter(Boolean)) {
      this.recentStderrLines.push(truncateBounded(line, MAX_STDERR_LINE_CHARS))
    }
    trimHead(this.recentStderrLines, MAX_RECENT_STDERR_LINES)
  }

  private recordModuleEvent(kind: ModuleEvent['kind'], testModule: TestModule): void {
    this.recentModuleEvents.push({
      kind,
      moduleId: testModule.relativeModuleId || testModule.moduleId,
    })
    trimHead(this.recentModuleEvents, MAX_RECENT_MODULE_EVENTS)
  }
}

export function createVitestWorkerExitDiagnosticsReporter(): Reporter {
  return new VitestWorkerExitDiagnosticsReporter()
}

export function formatWorkerExitDiagnostics(
  reason: TestRunEndReason,
  recentModuleEvents: ModuleEvent[],
  recentStderrLines: string[],
  unhandledErrors: ReadonlyArray<SerializedError>,
  unfinishedModules: string[],
  sentinelSummary: ForkExitRecordSummary,
): string {
  const lines = [
    '',
    '[vitest-worker-exit-diagnostics]',
    `reason: ${reason}`,
    `main-process: ${formatProcessResources()}`,
    `active resources: ${formatActiveResources()}`,
    'recent modules:',
    ...formatList(recentModuleEvents, event => `${event.kind}: ${event.moduleId}`),
    'unfinished modules:',
    ...formatList(unfinishedModules.slice(0, MAX_UNFINISHED_MODULES), moduleId => moduleId),
    'recent stderr:',
    ...formatList(recentStderrLines, line => line),
    'unhandled errors:',
    ...formatList(unhandledErrors.slice(0, MAX_UNHANDLED_ERRORS), error =>
      truncateBounded(JSON.stringify(serializeDiagnosticsError(error)), MAX_SERIALIZED_ERROR_CHARS),
    ),
    ...formatForkExitSentinelSection(sentinelSummary),
  ]
  if (unfinishedModules.length > MAX_UNFINISHED_MODULES) {
    lines.push(`  ... ${unfinishedModules.length - MAX_UNFINISHED_MODULES} more unfinished modules`)
  }
  if (unhandledErrors.length > MAX_UNHANDLED_ERRORS) {
    lines.push(`  ... ${unhandledErrors.length - MAX_UNHANDLED_ERRORS} more`)
  }
  return `${lines.join(EOL)}${EOL}`
}

// A module Vitest never reported queued/started/ended for at all (the crash-mid-collection case)
// won't appear in testModules; a module whose fork died before finishing it will, stuck in
// 'queued' or 'pending' — that's the signature this section exists to name.
function unfinishedModuleIds(testModules: ReadonlyArray<TestModule>): string[] {
  const moduleIds: string[] = []
  for (const testModule of testModules) {
    const state = testModule.state()
    if (state === 'queued' || state === 'pending') {
      moduleIds.push(testModule.relativeModuleId || testModule.moduleId)
    }
  }
  return moduleIds
}

function formatList<T>(items: T[], label: (item: T) => string): string[] {
  if (items.length === 0) return ['  (none recorded)']
  return items.map(item => `  - ${label(item)}`)
}

function truncateBounded(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 3)}...`
}

function trimHead<T>(items: T[], maxLength: number): void {
  if (items.length > maxLength) {
    items.splice(0, items.length - maxLength)
  }
}
