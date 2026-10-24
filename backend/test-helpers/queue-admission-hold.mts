import type { Job, Queue } from 'glide-mq'
import { onTestFinished, vi } from 'vitest'
import { runInsideTestWorkerProcessor } from '@vouchington/worker-runtime/testing'

function createAdmissionHold<T>() {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const admitted = Promise.withResolvers<T>()
  const hold = (add: () => Promise<T>) => {
    entered.resolve()
    return release.promise
      .then(() => runInsideTestWorkerProcessor(add))
      .then(
        result => {
          admitted.resolve(result)
          return result
        },
        err => {
          admitted.reject(err)
          throw err
        },
      )
  }
  // The service may handle a rejected add before the assertion awaits this receipt.
  void admitted.promise.catch(() => undefined)
  return { entered: entered.promise, admitted: admitted.promise, hold, release: release.resolve }
}

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
  const gate = createAdmissionHold<Job<unknown> | null>()
  const originalAdd = queue.add
  const spy = vi.spyOn(queue, 'add').mockImplementation((name, data, options) => {
    if (name !== jobName || !matchesData(data)) return originalAdd.call(queue, name, data, options)
    return gate.hold(() => originalAdd.call(queue, name, data, options))
  })
  const restore = () => {
    gate.release()
    spy.mockRestore()
  }
  onTestFinished(restore)
  return { ...gate, restore }
}

/** Hold one owned bulk add while unrelated queue admissions continue normally. */
export function holdQueueBulkAdmission(
  queue: Queue<unknown>,
  jobName: string,
  matchesData: (data: unknown) => boolean,
): {
  entered: Promise<void>
  admitted: Promise<Job<unknown>[]>
  release: () => void
  restore: () => void
} {
  const gate = createAdmissionHold<Job<unknown>[]>()
  const originalAddBulk = queue.addBulk
  const spy = vi.spyOn(queue, 'addBulk').mockImplementation(jobs => {
    if (!jobs.some(job => job.name === jobName && matchesData(job.data)))
      return originalAddBulk.call(queue, jobs)
    return gate.hold(() => originalAddBulk.call(queue, jobs))
  })
  const restore = () => {
    gate.release()
    spy.mockRestore()
  }
  onTestFinished(restore)
  return { ...gate, restore }
}
