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
