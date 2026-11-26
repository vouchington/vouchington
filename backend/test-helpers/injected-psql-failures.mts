import { vi } from 'vitest'
import { psql as psqlQueue } from '@queues/psql/queues'

/** Lose one named job's acknowledgement after the real PostgreSQL queue accepts it. */
export function loseNextPsqlJobAddReplyForTest(jobId: string, error: Error): () => void {
  const realAdd = psqlQueue.add
  const realAddBulk = psqlQueue.addBulk
  let lost = false
  const addSpy = vi.spyOn(psqlQueue, 'add').mockImplementation(async (name, data, options) => {
    const job = await Reflect.apply(realAdd, psqlQueue, [name, data, options])
    if (!lost && options?.jobId === jobId && job !== null) {
      lost = true
      throw error
    }
    return job
  })
  const addBulkSpy = vi.spyOn(psqlQueue, 'addBulk').mockImplementation(async jobs => {
    const added = await Reflect.apply(realAddBulk, psqlQueue, [jobs])
    if (!lost && added.some(job => job?.id === jobId)) {
      lost = true
      throw error
    }
    return added
  })
  return () => {
    addSpy.mockRestore()
    addBulkSpy.mockRestore()
  }
}
