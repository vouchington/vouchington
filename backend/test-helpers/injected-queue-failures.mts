import type { Queue } from 'glide-mq'
import { vi } from 'vitest'
import { backgroundQueue } from './shared-background-queue.mts'

/** Reject one admission on the supplied real queue; unrelated jobs pass through. */
export function rejectNextQueueJobAddForTest(
  queue: Pick<typeof backgroundQueue, 'add'>,
  jobName: string,
  error: Error,
): () => void {
  const realAdd = queue.add
  let rejected = false
  const spy = vi.spyOn(queue, 'add').mockImplementation((name, data, opts) => {
    if (!rejected && name === jobName) {
      rejected = true
      return Promise.reject(error)
    }
    return Reflect.apply(realAdd, queue, [name, data, opts])
  })
  return () => spy.mockRestore()
}

/** Reject matching admissions on a caller-owned queue while other jobs pass through. */
export function rejectQueueJobAddForTest<Data>(
  queue: Queue<Data>,
  matches: (name: string, data: Data) => boolean,
  error: Error,
): () => void {
  const realAdd = queue.add
  const spy = vi.spyOn(queue, 'add').mockImplementation((name, data, opts) => {
    if (matches(name, data)) return Promise.reject(error)
    return realAdd.call(queue, name, data, opts)
  })
  return () => spy.mockRestore()
}

/** Reject the next add of one named job on the real shared queue; unrelated jobs pass through. */
export function rejectNextBackgroundJobAddForTest(jobName: string, error: Error): () => void {
  const realAdd = backgroundQueue.add
  let rejected = false
  const spy = vi.spyOn(backgroundQueue, 'add').mockImplementation((name, data, opts) => {
    if (!rejected && name === jobName) {
      rejected = true
      return Promise.reject(error)
    }
    return Reflect.apply(realAdd, backgroundQueue, [name, data, opts])
  })
  return () => spy.mockRestore()
}

/** Reject the next bulk admission containing one named job; unrelated admissions run for real. */
export function rejectNextBackgroundJobAddBulkForTest(jobName: string, error: Error): () => void {
  const realAddBulk = backgroundQueue.addBulk
  let rejected = false
  const spy = vi.spyOn(backgroundQueue, 'addBulk').mockImplementation(jobs => {
    if (!rejected && jobs.some(job => job.name === jobName)) {
      rejected = true
      return Promise.reject(error)
    }
    return Reflect.apply(realAddBulk, backgroundQueue, [jobs])
  })
  return () => spy.mockRestore()
}
