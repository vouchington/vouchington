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

type BulkAdmissionSpec = {
  jobName: string
  matchesData: (data: unknown) => boolean
}

type BulkAdmissionHold = {
  entered: Promise<void>
  admitted: Promise<Job<unknown>[]>
  release: () => void
}

/** Hold distinct named bulk calls on one queue with one spy; foreign calls continue normally. */
export function holdQueueBulkAdmissions(
  queue: Queue<unknown>,
  specs: readonly BulkAdmissionSpec[],
): {
  holds: BulkAdmissionHold[]
  restore: () => void
} {
  const gates = specs.map(() => createAdmissionHold<Job<unknown>[]>())
  const originalAddBulk = queue.addBulk
  const spy = vi.spyOn(queue, 'addBulk').mockImplementation(jobs => {
    const matchingIndices = specs.flatMap((spec, index) =>
      jobs.some(job => job.name === spec.jobName && spec.matchesData(job.data)) ? [index] : [],
    )
    if (matchingIndices.length === 0) return originalAddBulk.call(queue, jobs)
    if (matchingIndices.length > 1)
      throw new Error('Grouped bulk admission cannot hold one addBulk call for multiple specs')
    return gates[matchingIndices[0]]!.hold(() => originalAddBulk.call(queue, jobs))
  })
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    for (const gate of gates) gate.release()
    spy.mockRestore()
  }
  onTestFinished(restore)
  return {
    holds: gates.map(({ entered, admitted, release }) => ({ entered, admitted, release })),
    restore,
  }
}

/** Hold one owned bulk add while unrelated queue admissions continue normally. */
export function holdQueueBulkAdmission(
  queue: Queue<unknown>,
  jobName: string,
  matchesData: (data: unknown) => boolean,
): BulkAdmissionHold & { restore: () => void } {
  const { holds, restore } = holdQueueBulkAdmissions(queue, [{ jobName, matchesData }])
  return { ...holds[0]!, restore }
}
