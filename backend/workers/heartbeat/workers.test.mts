import type { Job } from 'glide-mq'
import { afterAll, describe, expect, it } from 'vitest'

import { enqueueGlideMqStats } from '@queues/heartbeat/enqueues'
import type { HeartbeatData, HeartbeatResult } from '@queues/heartbeat/types'
import { heartbeat as heartbeatWorker } from './workers.mts'

describe('heartbeat worker', () => {
  afterAll(async () => {
    await heartbeatWorker.close()
  })

  it('publishes aggregate queue metrics before completing the heartbeat', async () => {
    const completed = trackCompletedHeartbeats()
    try {
      const enqueued = await enqueueGlideMqStats()
      if (!enqueued) throw new Error('Expected an enqueued heartbeat')
      const job = await completed.job(enqueued.id)

      expect(job.name).toBe('publish-glidemq-stats')
      expect(job.returnvalue).toMatchObject({ processedAt: expect.any(Number) })
    } finally {
      completed.stop()
    }
  })
})

function trackCompletedHeartbeats() {
  const seen = new Map<string, Job<HeartbeatData, HeartbeatResult>>()
  const waiters = new Map<string, (job: Job<HeartbeatData, HeartbeatResult>) => void>()
  const onCompleted = (job: Job<HeartbeatData, HeartbeatResult>) => {
    const waiter = waiters.get(job.id)
    if (waiter) {
      waiters.delete(job.id)
      waiter(job)
      return
    }
    seen.set(job.id, job)
  }
  heartbeatWorker.on('completed', onCompleted)
  return {
    stop() {
      heartbeatWorker.off('completed', onCompleted)
    },
    job(jobId: string): Promise<Job<HeartbeatData, HeartbeatResult>> {
      const queued = seen.get(jobId)
      if (queued) return Promise.resolve(queued)
      return new Promise(resolve => {
        waiters.set(jobId, resolve)
        const raced = seen.get(jobId)
        if (!raced) return
        waiters.delete(jobId)
        resolve(raced)
      })
    },
  }
}
