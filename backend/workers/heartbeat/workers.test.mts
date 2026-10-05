import { afterAll, describe, expect, it } from 'vitest'

import { pollUntilNotNull } from '@voucha/test-helpers/polling'
import { enqueueGlideMqStats } from '@queues/heartbeat/enqueues'
import { heartbeat as heartbeatQueue } from '@queues/heartbeat/queues'
import { heartbeat as heartbeatWorker } from './workers.mts'

describe('heartbeat worker', () => {
  afterAll(async () => {
    await heartbeatWorker.close()
  })

  it('publishes aggregate queue metrics before completing the heartbeat', async () => {
    const enqueued = await enqueueGlideMqStats()
    if (!enqueued) throw new Error('Expected an enqueued heartbeat')
    const job = await pollUntilNotNull(async () =>
      (await heartbeatQueue.getJobs('completed')).find(completed => completed.id === enqueued.id),
    )

    expect(job?.name).toBe('publish-glidemq-stats')
    expect(job?.returnvalue).toMatchObject({ processedAt: expect.any(Number) })
  })
})
