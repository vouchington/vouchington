/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must observe every test in the project's fork to build an accurate per-fork
   growth baseline, so it cannot be wrapped in a describe block. */
import { afterAll, afterEach } from 'vitest'
import {
  getOrCreateQueue,
  settleRunnableQueueJobs,
  TestQueueFlushTimeoutError,
} from '@vouchington/worker-runtime/testing'
import {
  countResourcesByType,
  formatForkLeakDiagnostics,
  getForkLeakDetector,
  getRegisteredPoolMetrics,
  getRegisteredPoolSocketHandles,
  waitForForkLeakHandshakeSettle,
  waitForResourceCloseCallbacks,
} from 'vouchington-tooling/vitest-diagnostics'
import { settleSharedBackgroundJobs } from './shared-background-worker.mts'
import { registerCurrentPsqlPoolMetrics } from '../backend/test-helpers/psql-pool-metrics.mts'

// Escape hatch for a run where the heuristic misfires — see docs/development/ci.md.
const detectionDisabled = process.env.VITEST_FORK_LEAK_DETECTION === 'off'
const detector = getForkLeakDetector()

const MAX_JOB_DATA_CHARS = 300

function truncate(text: string): string {
  return text.length > MAX_JOB_DATA_CHARS ? `${text.slice(0, MAX_JOB_DATA_CHARS)}...` : text
}

function describeJobData(data: unknown): string {
  try {
    return truncate(JSON.stringify(data) ?? String(data))
  } catch {
    return '[unserializable]'
  }
}

// Names the entity a stuck job works on (its data) and how often it already ran, so the failure
// points at the file that enqueued it.
function describePendingQueueJobs(
  queue: ReturnType<typeof getOrCreateQueue>,
  pendingJobIds: readonly string[],
): string {
  return pendingJobIds
    .map(id => {
      const record = queue.jobs.get(id)
      if (!record) return id
      const failure = record.failedReason ? ` failedReason=${truncate(record.failedReason)}` : ''
      return `${record.name}#${id}:${record.state} attemptsMade=${record.attemptsMade} data=${describeJobData(record.data)}${failure}`
    })
    .join(', ')
}

async function settleBackgroundQueue(queue: ReturnType<typeof getOrCreateQueue>): Promise<void> {
  try {
    await settleRunnableQueueJobs(queue)
  } catch (err) {
    if (!(err instanceof TestQueueFlushTimeoutError)) throw err
    const jobs = describePendingQueueJobs(queue, err.pendingJobIds)
    throw new Error(`${err.message} [jobs ${jobs}]`, { cause: err })
  }
}

afterEach(async ({ task }) => {
  if (detectionDisabled) return

  // The worker setup owns this queue, but vi.resetModules() can give a test another module-local
  // queue registry. Wait for both the setup worker and that test's current background queue.
  // Delayed and suspended jobs remain parked.
  const setupBackgroundQueue = getOrCreateQueue('background')
  const { getOrCreateQueue: getCurrentQueue } = await import('@vouchington/worker-runtime/testing')
  const currentBackgroundQueue = getCurrentQueue('background')
  await settleBackgroundQueue(setupBackgroundQueue)
  if (currentBackgroundQueue !== setupBackgroundQueue) {
    await settleBackgroundQueue(currentBackgroundQueue)
  }

  // Let pending handle-close callbacks run before snapshotting, so a socket already being
  // closed by the test's own cleanup doesn't read as newly elevated. setImmediate (check phase)
  // runs before close callbacks (close-callbacks phase) in the same loop iteration; setTimeout
  // schedules into the next iteration, after this iteration's close callbacks have all run.
  await waitForResourceCloseCallbacks()
  // Runnable shared-worker jobs check out pool clients. Count sockets only after they finish;
  // a client still checked out then is still growth. Parked jobs are not waited on.
  if (await settleSharedBackgroundJobs()) await waitForResourceCloseCallbacks()
  // Tests can replace the runtime module graph with vi.resetModules().
  await registerCurrentPsqlPoolMetrics()
  // Collapse only registered PostgreSQL pool handshakes into the checkpoint
  // that observes them. Unmatched socket growth remains visible to the detector.
  const settlement = await waitForForkLeakHandshakeSettle({
    readResources: () => process.getActiveResourcesInfo(),
    readPoolMetrics: getRegisteredPoolMetrics,
    readPoolSocketHandles: getRegisteredPoolSocketHandles,
    waitForTurn: waitForResourceCloseCallbacks,
  })

  // The detector's evidence windows are test checkpoints. Handshake turns are
  // diagnostic history within this test and must not advance those windows.
  const checkpoint = settlement.coalesced ? settlement.snapshot : settlement.detectorSnapshot
  const counts = countResourcesByType(checkpoint.resources)
  const findings = detector.record(counts, task.file.filepath).map(verdict => ({
    verdict,
    counts,
    poolMetrics: checkpoint.poolMetrics,
    observations: settlement.observations,
  }))
  if (findings.length > 0) {
    throw new Error(
      findings
        .map(
          ({ verdict, counts, poolMetrics, observations }) =>
            `${formatForkLeakDiagnostics(verdict, counts, poolMetrics, {
              poolMetricsLabel: 'PostgreSQL pool metrics:',
            })}\nTCP handshake observations: ${observations
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

// Election vote-stats jobs are enqueued with a real delay and the per-test settle skips delayed
// jobs, so a delayed job would otherwise come due during a later file in this fork. Drop what this
// file left parked (and any leftover waiting or prioritized work) before the next file starts.
afterAll(async () => {
  if (detectionDisabled) return
  const setupBackgroundQueue = getOrCreateQueue('background')
  const { getOrCreateQueue: getCurrentQueue } = await import('@vouchington/worker-runtime/testing')
  const currentBackgroundQueue = getCurrentQueue('background')
  await setupBackgroundQueue.drain(true)
  if (currentBackgroundQueue !== setupBackgroundQueue) await currentBackgroundQueue.drain(true)
})
