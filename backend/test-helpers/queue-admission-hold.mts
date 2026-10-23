import type { Job, Queue } from 'glide-mq'
import { onTestFinished, vi } from 'vitest'
import { runInsideTestWorkerProcessor } from '@vouchington/worker-runtime/testing'

/** Hold one owned add while unrelated jobs continue through the real queue. */
export function holdQueueAdmission(
  queue: Queue<unknown>,
  jobName: string,
  matchesData: (data: unknown) => boolean,
): {
  entered: Promise<void>
  admitted: Promise<Job<unknown> | null>
  release: () => void
  restore: () => void
} {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const admitted = Promise.withResolvers<Job<unknown> | null>()
  const originalAdd = queue.add
  const spy = vi.spyOn(queue, 'add').mockImplementation((name, data, options) => {
    if (name !== jobName || !matchesData(data)) return originalAdd.call(queue, name, data, options)
    entered.resolve()
    return release.promise
      .then(() => runInsideTestWorkerProcessor(() => originalAdd.call(queue, name, data, options)))
      .then(
        job => {
          admitted.resolve(job)
          return job
        },
        err => {
          admitted.reject(err)
          throw err
        },
      )
  })
  // The service may handle a rejected add before the assertion awaits this receipt.
  void admitted.promise.catch(() => undefined)
  const restore = () => {
    release.resolve()
    spy.mockRestore()
  }
  onTestFinished(restore)
  return { entered: entered.promise, admitted: admitted.promise, release: release.resolve, restore }
}
