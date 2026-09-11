import { entitiesListeners as entitiesListenersWorker } from './workers.mts'
import { entitiesListeners as entitiesListenersQueue } from '@queues/entity-listeners/queues'
import onError from '@modules/on-error'

// Attach an error handler to prevent unhandled 'error' events from crashing the
// process. In the worker runtime, addWorkerEventListeners() handles this; here in
// the test-support context (used by Playwright and Vitest), the Worker is imported
// as a side effect of this module but never goes through the worker
// bootstrap, so it needs its own handler.
entitiesListenersWorker.on('error', onError)

type EntityListenerJob = { name: string; data: Record<string, unknown> }

type EntityListenerQueueSearch = {
  searchJobs(opts: {
    name?: string
    data?: Record<string, unknown>
    state?: string
  }): Promise<EntityListenerJob[]>
}

async function countCompletedEntityListenerJobs(
  jobName: string,
  entityId?: string,
): Promise<number> {
  const completed = await (
    entitiesListenersQueue as unknown as EntityListenerQueueSearch
  ).searchJobs({
    name: jobName,
    state: 'completed',
  })
  return completed.filter(job => entityId === undefined || job.data.id === entityId).length
}

type WorkerLike = {
  isDrained: boolean
  on(event: 'active', cb: (job: { name: string; data: Record<string, unknown> }) => void): void
  on(event: 'completed', cb: (job: { name: string; data: Record<string, unknown> }) => void): void
  on(
    event: 'failed',
    cb: (job: { name: string; data: Record<string, unknown> } | undefined, err: Error) => void,
  ): void
  off(event: 'completed', cb: (job: { name: string; data: Record<string, unknown> }) => void): void
  off(
    event: 'failed',
    cb: (job: { name: string; data: Record<string, unknown> } | undefined, err: Error) => void,
  ): void
  off(event: 'active', cb: (job: { name: string; data: Record<string, unknown> }) => void): void
}

export function onceEntityListenerActive(jobName: string, entityId?: string): Promise<void> {
  const worker = entitiesListenersWorker as unknown as WorkerLike
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      const entityDesc = entityId ? ` for entity ${entityId}` : ''
      reject(
        new Error(
          `onceEntityListenerActive timed out after 15000ms waiting for '${jobName}'${entityDesc}`,
        ),
      )
    }, 15_000)

    function cleanup(): void {
      worker.off('active', onActive)
      clearTimeout(timer)
    }

    function onActive(job: { name: string; data: Record<string, unknown> }): void {
      if (job.name !== jobName) return
      if (entityId !== undefined && job.data.id !== entityId) return
      cleanup()
      resolve()
    }

    worker.on('active', onActive)
  })
}

/**
 * Wait for a specific entity-listener job to complete.
 *
 * Entity-listener enqueues are fire-and-forget in services, so tests that
 * assert on side effects (cache invalidation, auto-subscribe, notifications,
 * etc.) must call this after the service call that triggers
 * the enqueue.
 *
 * Pass `entityId` to wait for the job for a specific entity (matches job.data.id),
 * preventing false positives from concurrent jobs of the same name in other tests.
 *
 * Enqueues are fire-and-forget and the Vitest GlideMQ shim may finish (and emit
 * `completed`) before this helper registers its listener; matching jobs already in
 * the `completed` state are counted up front so that race does not time out.
 *
 * Rejects if the job fails, so regressions surface as clear errors rather
 * than 30s test timeouts.
 *
 * @param count - number of jobs to wait for (default: 1). Use when a test
 *   triggers multiple enqueues of the same job name (e.g. creating 5 posts
 *   in a loop fires 5 `processPostCreated` jobs).
 *
 * @example
 * ```ts
 * const post = await createPost(user, { title: 'Hello' })
 * await onceEntityListenerCompleted('processPostCreated', post.id)
 * // auto-subscribe and other side effects have now run for this post
 *
 * await request.delete(`/api/v1/posts/${postId}`).expect(204)
 * await onceEntityListenerCompleted('processPostDeleted', postId)
 * await request.get(`/api/v1/posts/${postId}`).expect(404)
 * ```
 */
export async function onceEntityListenerCompleted(
  jobName: string,
  entityId?: string,
  count = 1,
  timeoutMs = 15_000,
): Promise<void> {
  if (count <= 0) return
  const worker = entitiesListenersWorker as unknown as WorkerLike
  // If the worker is already drained, all jobs have completed — nothing to wait for.
  if (worker.isDrained) return
  const alreadyCompleted = await countCompletedEntityListenerJobs(jobName, entityId)
  if (alreadyCompleted >= count) return
  let remaining = count - alreadyCompleted
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      const entityDesc = entityId ? ` for entity ${entityId}` : ''
      reject(
        new Error(
          `onceEntityListenerCompleted timed out after ${timeoutMs}ms waiting for '${jobName}'${entityDesc}`,
        ),
      )
    }, timeoutMs)

    function cleanup(): void {
      worker.off('completed', onCompleted)
      worker.off('failed', onFailed)
      clearTimeout(timer)
    }

    function onCompleted(job: { name: string; data: Record<string, unknown> }): void {
      if (job.name !== jobName) return
      if (entityId !== undefined && job.data.id !== entityId) return
      remaining--
      if (remaining <= 0) {
        cleanup()
        resolve()
      }
    }

    function onFailed(
      job: { name: string; data: Record<string, unknown> } | undefined,
      err: Error,
    ): void {
      if (job === undefined || job.name !== jobName) return
      if (entityId !== undefined && job.data.id !== entityId) return
      cleanup()
      reject(new Error(`Entity listener job '${jobName}' failed: ${err.message}`))
    }

    worker.on('completed', onCompleted)
    worker.on('failed', onFailed)
  })
}
