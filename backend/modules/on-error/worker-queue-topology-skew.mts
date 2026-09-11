import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and valkey-saturation.mts — kept local to avoid
// changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

/**
 * Record that a worker process dropped one or more `QUEUES` include-list entries it does not
 * implement, rather than crash-looping the whole process over them.
 *
 * This happens when infrastructure deploys a task definition whose `QUEUES` include list is newer
 * or older than this process's compiled `WORKER_DEFINITIONS`. It is a transient deploy-skew signal,
 * not a typo: invalid queue names are caught at CI time by
 * `backend/entrypoints/worker-cpu/__tests__/worker-queue-policy.test.mts`. Non-fatal: the worker
 * still starts and runs the queues it does recognize.
 *
 * Called at most a few times per process startup (not on a hot path), so this intentionally does
 * not throttle: Sentry already groups repeated `captureMessage` calls with the same message under
 * one issue with an occurrence count, as it did for BACKEND-JX itself.
 */
export function recordWorkerQueueTopologySkew(unknownQueueNames: readonly string[]): void {
  if (unknownQueueNames.length === 0) return

  if (shouldLogToConsole()) {
    console.warn('[worker-runtime] dropping unknown QUEUES entries', unknownQueueNames)
  }
  Sentry.captureMessage('worker_queue_topology_skew', {
    level: 'warning',
    tags: { reason: 'worker_queue_topology_skew' },
    extra: { unknownQueueNames },
  })
}
