import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { acceptJobsFor } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import { enqueueDeliverAcceptActivity } from '@queues/activitypub-delivery/enqueues'

describe('acceptJobsFor', () => {
  it('selects an Accept job returned by the real enqueue function', async () => {
    const actorId = randomUUID()
    const followActivityId = `https://remote.example/activities/${randomUUID()}`
    const enqueued = await enqueueDeliverAcceptActivity({
      sourceUserId: randomUUID(),
      inboxUrl: 'https://remote.example/inbox',
      followActivityId,
      followActorUri: `https://remote.example/users/${actorId}`,
    })
    const acceptJob = await readEnqueuedJob(activitypubDelivery, enqueued)

    expect(acceptJobsFor([acceptJob], followActivityId)).toEqual([acceptJob.data])
  })
})
