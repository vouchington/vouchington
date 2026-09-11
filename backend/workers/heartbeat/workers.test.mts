import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { enqueueGlideMqStats } from '@queues/heartbeat/enqueues'
import { heartbeat as heartbeatQueue } from '@queues/heartbeat/queues'
import { heartbeat as heartbeatWorker } from './workers.mts'

describe('heartbeat worker', () => {
  beforeEach(async () => {
    await heartbeatQueue.obliterate({ force: true })
  })

  afterAll(async () => {
    await heartbeatWorker.close()
  })

  it('publishes aggregate queue metrics before completing the heartbeat', async () => {
    await enqueueGlideMqStats()
    const [job] = await heartbeatQueue.getJobs('completed')

    expect(job?.name).toBe('publish-glidemq-stats')
    expect(job?.returnvalue).toMatchObject({ processedAt: expect.any(Number) })
  })
})
