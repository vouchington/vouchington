import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PRIORITY_DISPATCH } from '@queues/background/config'
import { readAllQueueJobs, readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import {
  enqueueBulkDeliverActivity,
  enqueueBulkDistributeActivity,
  enqueueDeliverAcceptActivity,
  enqueueDistributeActivity,
  type DistributeActivityData,
} from './delivery.mts'
import { backgroundQueue as activitypub } from '@voucha/test-helpers/shared-background-queue'

function followData(activityId = randomUUID()): DistributeActivityData {
  return {
    activityId,
    activityType: 'Follow',
    sourceUserId: randomUUID(),
    targetUserId: randomUUID(),
  }
}

describe('ActivityPub delivery enqueues', () => {
  it('deduplicates a single distribution by its activity and first-page cursor', async () => {
    const data = followData()

    await enqueueDistributeActivity(data)
    await enqueueDistributeActivity(data)

    const jobs = (await readAllQueueJobs(activitypub)).filter(
      job => (job.data as { activityId?: string }).activityId === data.activityId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      name: 'activitypub.distributeActivity',
      data,
      opts: {
        priority: PRIORITY_DISPATCH,
        ordering: { key: 'activitypub:outbound-dispatch', concurrency: 2 },
      },
    })
    expect(jobs[0]!.opts.deduplication).toBeUndefined()
    expect(jobs[0]!.opts.jobId).toBe(`activitypub-distribute__${data.activityId}__start`)
  })

  it('leaves every bulk distribution in the outbound lane', async () => {
    const inputs = [followData(), followData()]

    await enqueueBulkDistributeActivity(inputs)

    const activityIds = new Set(inputs.map(input => input.activityId))
    const jobs = (await readAllQueueJobs(activitypub)).filter(job =>
      activityIds.has((job.data as { activityId: string }).activityId),
    )
    expect(jobs).toHaveLength(2)
    for (const job of jobs) {
      expect(job.opts).toMatchObject({
        priority: PRIORITY_DISPATCH,
        ordering: { key: 'activitypub:outbound-dispatch', concurrency: 2 },
      })
      expect(job.opts.deduplication).toBeUndefined()
      expect(job.opts.jobId).toBe(
        `activitypub-distribute__${(job.data as DistributeActivityData).activityId}__start`,
      )
    }
  })

  it('preserves the exact delivery simple-deduplication key', async () => {
    const data = followData()
    const inboxUrl = `https://${randomUUID()}.example/inbox`

    await enqueueBulkDeliverActivity([{ ...data, inboxUrl }])

    const jobs = (await readAllQueueJobs(activitypub)).filter(
      job =>
        job.name === 'activitypub.deliverActivity' &&
        (job.data as { activityId?: string }).activityId === data.activityId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `deliver_${data.activityId}__${inboxUrl}`,
        mode: 'simple',
      },
    })
    expect(jobs[0]!.opts.ordering).toEqual({ key: 'activitypub:outbound', concurrency: 5 })
  })

  describe('Accept activity id', () => {
    async function enqueueAccept(sourceId: string, followId: string) {
      return readEnqueuedJob(
        activitypub,
        await enqueueDeliverAcceptActivity({
          sourceUserId: sourceId,
          inboxUrl: `https://${randomUUID()}.example/inbox`,
          followActivityId: followId,
          followActorUri: 'https://remote.example/users/alice',
        }),
      )
    }

    it('is stable for one local user acknowledging one inbound Follow', async () => {
      const sourceUserId = randomUUID()
      const followActivityId = `https://remote.example/activities/${randomUUID()}`
      const first = await enqueueAccept(sourceUserId, followActivityId)
      const id = (first.data as { activityId: string }).activityId

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      await first.remove()
      const repeat = await enqueueAccept(sourceUserId, followActivityId)
      expect((repeat.data as { activityId: string }).activityId).toBe(id)
    })

    it('differs for another Follow or another local user so no Accept is mistaken for a repeat', async () => {
      const sourceUserId = randomUUID()
      const followActivityId = `https://remote.example/activities/${randomUUID()}`
      const first = await enqueueAccept(sourceUserId, followActivityId)
      const id = (first.data as { activityId: string }).activityId
      const anotherFollow = await enqueueAccept(
        sourceUserId,
        `https://remote.example/activities/${randomUUID()}`,
      )
      expect((anotherFollow.data as { activityId: string }).activityId).not.toBe(id)
      await first.remove()
      const anotherUser = await enqueueAccept(randomUUID(), followActivityId)
      expect((anotherUser.data as { activityId: string }).activityId).not.toBe(id)
    })

    it('is the activity id the queued Accept job carries', async () => {
      const input = {
        sourceUserId: randomUUID(),
        inboxUrl: `https://${randomUUID()}.example/inbox`,
        followActivityId: `https://remote.example/activities/${randomUUID()}`,
        followActorUri: 'https://remote.example/users/alice',
      }

      await enqueueDeliverAcceptActivity(input)

      const jobs = (await readAllQueueJobs(activitypub)).filter(
        job => (job.data as { inboxUrl?: string }).inboxUrl === input.inboxUrl,
      )
      expect(jobs).toHaveLength(1)
      expect(jobs[0]!.data).toEqual({
        ...input,
        activityType: 'Accept',
        activityId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      })
    })
  })
})
