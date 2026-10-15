/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must observe every test in the project's fork to build an accurate per-fork
   growth baseline, so it cannot be wrapped in a describe block. */
import { afterEach } from 'vitest'
import { waitForResourceCloseCallbacks } from 'vouchington-tooling/vitest-diagnostics'
import {
  formatForkLeakDiagnostics,
  getRegisteredPsqlPoolMetrics,
  getRegisteredPsqlPoolSocketHandles,
} from './vitest-fork-leak-diagnostics.mts'
import { getForkLeakDetector } from './vitest-fork-leak-detection.mts'
import { waitForForkLeakHandshakeSettle } from './vitest-fork-leak-handshake.mts'
import { countResourcesByType } from './vitest-process-resources.mts'

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
  // Collapse only registered PostgreSQL pool handshakes into the checkpoint
  // that observes them. Unmatched socket growth remains visible to the detector.
  const settlement = await waitForForkLeakHandshakeSettle({
    readResources: () => process.getActiveResourcesInfo(),
    readPsqlPoolMetrics: getRegisteredPsqlPoolMetrics,
    readPsqlPoolSocketHandles: getRegisteredPsqlPoolSocketHandles,
  })

  const snapshots = settlement.coalesced ? [settlement.snapshot] : settlement.observations
  const findings = snapshots.flatMap(snapshot => {
    const counts = countResourcesByType(snapshot.resources)
    return detector
      .record(counts, context.task.file.filepath)
      .map(verdict => ({ verdict, counts, psqlPoolMetrics: snapshot.psqlPoolMetrics }))
  })
  if (findings.length > 0) {
    throw new Error(
      findings
        .map(({ verdict, counts, psqlPoolMetrics }) =>
          formatForkLeakDiagnostics(verdict, counts, psqlPoolMetrics),
        )
        .join('\n\n'),
    )
  }
})
