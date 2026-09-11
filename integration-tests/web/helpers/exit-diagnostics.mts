import { readRecentLog } from './log-tail.mts'
import type { ManagedProcess, ManagedProcessExit } from './processes.mts'

// Exported (with formatExitStatus below) so ci/__tests__/web-integration-processes.test.mts
// can assert on the marker without duplicating the literal.
export const POST_READY_EXIT_MARKER_PREFIX = '[processes] managed process'

export function formatExitStatus(exit: ManagedProcessExit): string {
  return exit.error
    ? `error ${exit.error.message}`
    : exit.code === null
      ? `signal ${exit.signal ?? 'unknown'}`
      : `code ${String(exit.code)}`
}

function logDiagnosticLines(headline: string, logPath: string): string {
  const logTail = readRecentLog(logPath)
  return [
    headline,
    `Service log: ${logPath}`,
    logTail ? `Recent service log:\n${logTail}` : 'Recent service log: <empty>',
  ].join('\n')
}

export function serviceExitMessage(
  name: string,
  url: string,
  logPath: string,
  exit: ManagedProcessExit,
): string {
  return logDiagnosticLines(
    `Service ${name} exited with ${formatExitStatus(exit)} before becoming ready at ${url}.`,
    logPath,
  )
}

// waitForService's startup race only guards readiness; once a process is ready,
// nothing else watches it. This arms an independent watcher so a post-ready crash
// (e.g. workerd's "Connection reset by peer", #2869) reports a clear marker instead
// of surfacing only as unrelated test failures in whatever ran next.
export function watchForPostReadyExit(name: string, managedProcess: ManagedProcess): void {
  void managedProcess.exited.then(exit => {
    // Every process gets stop() called at teardown (cleanupGlobalSetupState); that
    // exit is expected, not a finding.
    if (managedProcess.wasStopRequested()) {
      return
    }
    process.stderr.write(
      `${logDiagnosticLines(
        `${POST_READY_EXIT_MARKER_PREFIX} ${name} exited unexpectedly after ready: ${formatExitStatus(exit)}`,
        managedProcess.logPath,
      )}\n`,
    )
  })
}
