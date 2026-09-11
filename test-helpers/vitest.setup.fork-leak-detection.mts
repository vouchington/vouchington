/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must observe every test in the project's fork to build an accurate per-fork
   growth baseline, so it cannot be wrapped in a describe block. */
import { afterEach } from 'vitest'
import {
  formatForkLeakDiagnostics,
  getForkLeakDetector,
  waitForResourceCloseCallbacks,
} from './vitest-fork-leak-detection.mts'
import { countResourcesByType } from './vitest-process-resources.mts'
import { getExistingPsqlPoolMetrics } from '@data-stores/psql/pool-metrics'

// Escape hatch for a run where the heuristic misfires — see docs/development/ci.md.
const detectionDisabled = process.env.VITEST_FORK_LEAK_DETECTION === 'off'
const detector = getForkLeakDetector()

afterEach(async context => {
  if (detectionDisabled) return

  // Let pending handle-close callbacks run before snapshotting, so a socket already being
  // closed by the test's own cleanup doesn't read as newly elevated. setImmediate (check phase)
  // runs before close callbacks (close-callbacks phase) in the same loop iteration; setTimeout
  // schedules into the next iteration, after this iteration's close callbacks have all run.
  await waitForResourceCloseCallbacks()

  const resources = process.getActiveResourcesInfo()
  const counts = countResourcesByType(resources)
  const verdicts = detector.record(counts, context.task.file.filepath)
  if (verdicts.length > 0) {
    throw new Error(
      verdicts
        .map(verdict => formatForkLeakDiagnostics(verdict, counts, getExistingPsqlPoolMetrics()))
        .join('\n\n'),
    )
  }
})
