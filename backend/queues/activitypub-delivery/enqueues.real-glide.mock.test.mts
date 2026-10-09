import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { enqueueDeliverAcceptActivity, type DeliverAcceptActivityInput } from './enqueues.mts'
import { activitypubDelivery } from './queues.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

function acceptInput(): DeliverAcceptActivityInput {
  return {
    sourceUserId: randomUUID(),
    inboxUrl: `https://${randomUUID()}.example/inbox`,
    followActivityId: `https://remote.example/activities/${randomUUID()}`,
    followActorUri: 'https://remote.example/users/alice',
  }
}

async function enqueueAccept(input: DeliverAcceptActivityInput): Promise<Job> {
  const job = (await enqueueDeliverAcceptActivity(input)) as Job | null
  if (!job) throw new Error('Expected the Accept job to be created')
  return job
}

describe('Accept delivery enqueue through real GlideMQ', () => {
  afterAll(() => activitypubDelivery.close())

  it('keeps one Accept activity id for a Follow acknowledged again after the first job is gone', async () => {
    const input = acceptInput()
    const first = await enqueueAccept(input)
    const created = [first]
    try {
      // While the first Accept is in flight, a duplicate Follow collapses into it.
      await expect(enqueueDeliverAcceptActivity(input)).resolves.toBeNull()

      // Removing the job stands in for its terminal record trimming away: the hold is released.
      await first.remove()
      const second = await enqueueAccept(input)
      created.push(second)

      expect(second.id).not.toBe(first.id)
      expect(second.data).toMatchObject({ activityType: 'Accept', ...input })
      expect((second.data as { activityId: string }).activityId).toBe(
        (first.data as { activityId: string }).activityId,
      )
    } finally {
      await Promise.allSettled(created.map(job => job.remove()))
    }
  })
})
