/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must observe every test in the project's fork to build an accurate per-fork
   growth baseline, so it cannot be wrapped in a describe block. */
import { afterEach } from 'vitest'
import { getOrCreateQueue, settleRunnableQueueJobs } from '@vouchington/worker-runtime/testing'
import { waitForResourceCloseCallbacks } from 'vouchington-tooling/vitest-diagnostics'
import {
  formatForkLeakDiagnostics,
  getRegisteredPsqlPoolMetrics,
  getRegisteredPsqlPoolSocketHandles,
} from './vitest-fork-leak-diagnostics.mts'
import { getForkLeakDetector } from './vitest-fork-leak-detection.mts'
import {
  recordForkLeakCheckpoint,
  waitForForkLeakHandshakeSettle,
} from './vitest-fork-leak-handshake.mts'
import { countResourcesByType } from './vitest-process-resources.mts'
import { settleSharedBackgroundJobs } from './shared-background-worker.mts'

// Escape hatch for a run where the heuristic misfires — see docs/development/ci.md.
const detectionDisabled = process.env.VITEST_FORK_LEAK_DETECTION === 'off'
const detector = getForkLeakDetector()
;(globalThis as typeof globalThis & Record<symbol, unknown>)[
  Symbol.for('vitest-fork-leak-resource-close-callback-wait')
] = waitForResourceCloseCallbacks

afterEach(async context => {
  if (detectionDisabled) return

  // The worker setup owns this queue, but vi.resetModules() can give a test another module-local
  // queue registry. Wait for both the setup worker and that test's current background queue.
  // Delayed and suspended jobs remain parked.
  const setupBackgroundQueue = getOrCreateQueue('background')
  const { getOrCreateQueue: getCurrentQueue } = await import('@vouchington/worker-runtime/testing')
  const currentBackgroundQueue = getCurrentQueue('background')
  await settleRunnableQueueJobs(setupBackgroundQueue)
  if (currentBackgroundQueue !== setupBackgroundQueue) {
    await settleRunnableQueueJobs(currentBackgroundQueue)
  }

  // Let pending handle-close callbacks run before snapshotting, so a socket already being
  // closed by the test's own cleanup doesn't read as newly elevated. setImmediate (check phase)
  // runs before close callbacks (close-callbacks phase) in the same loop iteration; setTimeout
  // schedules into the next iteration, after this iteration's close callbacks have all run.
  await waitForResourceCloseCallbacks()
  // Runnable shared-worker jobs check out pool clients. Count sockets only after they finish;
  // a client still checked out then is still growth. Parked jobs are not waited on.
  if (await settleSharedBackgroundJobs()) await waitForResourceCloseCallbacks()
  // Collapse only registered PostgreSQL pool handshakes into the checkpoint
  // that observes them. Unmatched socket growth remains visible to the detector.
  const settlement = await waitForForkLeakHandshakeSettle({
    readResources: () => process.getActiveResourcesInfo(),
    readPsqlPoolMetrics: getRegisteredPsqlPoolMetrics,
    readPsqlPoolSocketHandles: getRegisteredPsqlPoolSocketHandles,
    waitForTurn: waitForResourceCloseCallbacks,
  })

  // The detector's evidence windows are test checkpoints. Handshake turns are
  // diagnostic history within this test and must not advance those windows.
  const counts = countResourcesByType(
    (settlement.coalesced ? settlement.snapshot : settlement.detectorSnapshot).resources,
  )
  const findings = recordForkLeakCheckpoint(
    (counts, testFile) => detector.record(counts, testFile),
    settlement,
    context.task.file.filepath,
  ).map(verdict => ({
    verdict,
    counts,
    psqlPoolMetrics: (settlement.coalesced ? settlement.snapshot : settlement.detectorSnapshot)
      .psqlPoolMetrics,
    observations: settlement.observations,
  }))
  if (findings.length > 0) {
    throw new Error(
      findings
        .map(
          ({ verdict, counts, psqlPoolMetrics, observations }) =>
            `${formatForkLeakDiagnostics(verdict, counts, psqlPoolMetrics)}\nTCP handshake observations: ${observations
              .map(
                ({ connectWraps, tcpSockets }) =>
                  `ConnectWrap=${connectWraps}/TCPSocketWrap=${tcpSockets}`,
              )
              .join(' -> ')}`,
        )
        .join('\n\n'),
    )
  }
})
