import type { Reporter } from 'vitest/node'
import { formatTeardownOverrunDiagnostics } from './vitest-teardown-overrun-diagnostics.mts'

class VitestTeardownOverrunReporter implements Reporter {
  // Fired by Vitest's exit() watchdog at the teardownTimeout deadline, in the main process, right
  // before it force-exits; see formatTeardownOverrunDiagnostics() for what it captures.
  onProcessTimeout(): void {
    process.stderr.write(formatTeardownOverrunDiagnostics())
  }
}

export function createVitestTeardownOverrunReporter(): Reporter {
  return new VitestTeardownOverrunReporter()
}
