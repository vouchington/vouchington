import { EOL } from 'node:os'
import { formatActiveResources, formatProcessResources } from './vitest-process-resources.mts'

// Composed from onProcessTimeout (vitest-worker-exit-diagnostics-reporter.mts), which Vitest's
// exit() watchdog fires at the teardownTimeout deadline, in the main process, right before it
// force-exits — the last chance to capture what teardown was still doing (see #8259).
// Deliberately excludes worker-exit error text (that block belongs to onTestRunEnd) so this
// never perturbs hasOnlyVitestWorkerExitUnhandledErrors()'s exact unhandled-error counts;
// regression-tested in ci/transient-retry/backend-test-worker-exit-ci-rules.test.mts.
export function formatTeardownOverrunDiagnostics(): string {
  const lines = [
    '',
    '[vitest-teardown-overrun]',
    `process: ${formatProcessResources()}`,
    `active resources: ${formatActiveResources()}`,
  ]
  return `${lines.join(EOL)}${EOL}`
}
