import type { Queue } from 'glide-mq'
import { vi } from 'vitest'
import type { backgroundQueue } from './shared-background-queue.mts'

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

/** Reject matching bulk admissions while all other queue operations remain real. */
export function rejectQueueBulkAddForTest<Data>(
  queue: Queue<Data>,
  matches: (name: string, data: Data) => boolean,
  error: Error,
): () => void {
  const realAddBulk = queue.addBulk
  const spy = vi.spyOn(queue, 'addBulk').mockImplementation((jobs, ...rest) => {
    if (jobs.some(job => matches(job.name, job.data))) return Promise.reject(error)
    return realAddBulk.call(queue, jobs, ...rest)
  })
  return () => spy.mockRestore()
}
