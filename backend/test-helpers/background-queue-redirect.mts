import { onTestFinished, vi } from 'vitest'
import type * as GlideMq from 'glide-mq'
import type * as WorkerRuntime from '@vouchington/worker-runtime/glide-mq'

/**
 * Points the production `background` queue singleton at an isolated queue until the test
 * finishes: lookups by job id and the queue namespace follow `isolated`. Module mocks of internal
 * queue modules are disallowed, so this spies on the singleton's own members.
 */
export function redirectBackgroundQueueTo(
  production: Pick<GlideMq.Queue, 'getJob' | 'name'>,
  isolated: Pick<GlideMq.Queue, 'getJob' | 'name'>,
): void {
  const getJob = vi
    .spyOn(production, 'getJob')
    .mockImplementation(async jobId => isolated.getJob(jobId))
  const originalName = Object.getOwnPropertyDescriptor(production, 'name')
  Object.defineProperty(production, 'name', { value: isolated.name, configurable: true })
  onTestFinished(() => {
    getJob.mockRestore()
    if (originalName) Object.defineProperty(production, 'name', originalName)
  })
}

// The mock factory runs while the queue modules load, so it must not import them statically.
const BACKGROUND_QUEUE_NAME = 'background'

let redirected: GlideMq.Queue | undefined

/**
 * Wraps the real worker runtime (for `vi.mock('@vouchington/worker-runtime/glide-mq', ...)`) so the
 * production `background` queue can be pointed at an isolated queue for one test. While redirected,
 * its job admission, reads and name reach that queue; digest window jobs get a single attempt so a
 * failure settles.
 */
export function withRedirectableBackgroundQueue(
  original: typeof WorkerRuntime,
): typeof WorkerRuntime {
  return {
    ...original,
    createGlideMqRuntime: config => {
      const runtime = original.createGlideMqRuntime(config)
      return {
        ...runtime,
        createQueue: ((name, options) => {
          const queue = runtime.createQueue(name, options)
          if (name === BACKGROUND_QUEUE_NAME) makeRedirectable(queue)
          return queue
        }) as typeof runtime.createQueue,
      }
    },
  }
}

function makeRedirectable(queue: GlideMq.Queue) {
  const productionName = queue.name
  const addBulk = queue.addBulk
  const getJobCounts = queue.getJobCounts
  Object.defineProperty(queue, 'name', { get: () => redirected?.name ?? productionName })
  queue.addBulk = async jobs => {
    if (!redirected) return addBulk.call(queue, jobs)
    const { NOTIFICATIONS_DIGEST_DISPATCH_JOB } =
      await import('@queues/background/enqueues/notifications-jobs')
    return redirected.addBulk(
      jobs.map(job =>
        job.name === NOTIFICATIONS_DIGEST_DISPATCH_JOB.name
          ? { ...job, opts: { ...job.opts, attempts: 1 } }
          : job,
      ),
    )
  }
  queue.getJobCounts = () => (redirected ? redirected.getJobCounts() : getJobCounts.call(queue))
}

/** Point the production `background` queue at `queue` until the current test finishes. */
export function redirectBackgroundQueue(queue: GlideMq.Queue): GlideMq.Queue {
  redirected = queue
  onTestFinished(() => {
    redirected = undefined
  })
  return queue
}
