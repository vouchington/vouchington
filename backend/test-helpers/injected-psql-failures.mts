import { vi } from 'vitest'
import { psql as psqlQueue } from '@queues/psql/queues'

/** Lose one named job's acknowledgement after the real PostgreSQL queue accepts it. */
export function loseNextPsqlJobAddReplyForTest(jobId: string, error: Error): () => void {
  const realAdd = psqlQueue.add
  let lost = false
  const spy = vi.spyOn(psqlQueue, 'add').mockImplementation(async (name, data, options) => {
    const job = await Reflect.apply(realAdd, psqlQueue, [name, data, options])
    if (!lost && options?.jobId === jobId && job !== null) {
      lost = true
      throw error
    }
    return job
  })
  return () => spy.mockRestore()
}
