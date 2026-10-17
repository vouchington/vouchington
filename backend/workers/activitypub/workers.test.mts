import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { activitypubHandlers } from './workers.mts'

function handlerFor(name: string) {
  return activitypubHandlers.find(handler => handler.job.name === name)!
}

describe('ActivityPub background handlers', () => {
  it('treats a stale delivery lease as an idempotent no-op on any attempt', async () => {
    const job = {
      data: { deliveryId: randomUUID(), leaseToken: randomUUID() },
      attemptsMade: 4,
      opts: { attempts: 5 },
    } as unknown as Job

    await expect(
      handlerFor(ACTIVITYPUB_PROCESS_DELIVERY_JOB.name).handle(job),
    ).resolves.toBeUndefined()
  })

  it('re-arms the page after the cursor carried by the job', async () => {
    const job = { data: { afterId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } } as unknown as Job

    await expect(
      handlerFor(ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name).handle(job),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
  })
})
