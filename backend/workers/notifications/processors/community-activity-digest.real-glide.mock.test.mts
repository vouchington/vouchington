import { once } from 'node:events'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { QueueEvents, type Job } from 'glide-mq'
import {
  addTestDigestMember,
  beforeTestDigestUserId,
  createTestDigestAdjacentUsers,
  getTestCommunityActivityDigestQueueConnection,
  readTestCommunityActivityDigestCursor,
  readTestCommunityActivityDigestDelivery,
  withTestCommunityActivityDigestCursor,
} from '@voucha/test-helpers/community-activity-digest-dispatch'
import { NOTIFICATIONS_DIGEST_DISPATCH_JOB } from '@queues/background/enqueues/notifications-jobs'
import { redirectBackgroundQueue } from '@voucha/test-helpers/background-queue-redirect'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { notificationsWorkConfig } from '@services/notifications/work-limits'
import { createCommunityActivityDigestBatch } from '@services/notifications/community-activity-digest'
import {
  advanceCommunityActivityDigestCursor,
  isCommunityActivityDigestWindowComplete,
} from '@services/notifications/community-activity-digest-dispatch'
import {
  enqueueCommunityActivityDigestWindows,
  type CommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues/community-activity-digest'
import { processCommunityActivityDigestDispatch } from './community-activity-digest.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())
vi.mock<typeof import('@vouchington/worker-runtime/glide-mq')>(
  import('@vouchington/worker-runtime/glide-mq'),
  async original =>
    (
      await import('@voucha/test-helpers/background-queue-redirect')
    ).withRedirectableBackgroundQueue(await original()),
)

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const connection = getTestCommunityActivityDigestQueueConnection()

function ownedWindow() {
  const now = new Date()
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  return { now, start, end: new Date(start.getTime() + WEEK_MS) }
}

function windowData(start: Date, end: Date): CommunityActivityDigestDispatchData {
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() }
}

describe('community activity digest native worker', () => {
  it('checkpoints a recipient page on the retained job before processing the next page', async () => {
    const restore = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      community_digest_recipient_batch_size: 1,
    })
    onTestFinished(restore)
    const { now, start, end } = ownedWindow()
    const [first, second] = await createTestDigestAdjacentUsers()
    await addTestDigestMember(first, now)
    await addTestDigestMember(second, now)

    await withTestCommunityActivityDigestCursor(start, async (query, owner) => {
      const secondEntered = Promise.withResolvers<void>()
      const releaseSecond = Promise.withResolvers<void>()
      let activations = 0
      const harness = await startRealGlideBackgroundLifecycle({
        queueNamePrefix: 'community_digest_pages',
        connection,
        workerOptions: { blockTimeout: 100 },
        processor: async (job): Promise<unknown> => {
          if (job.name !== NOTIFICATIONS_DIGEST_DISPATCH_JOB.name) return
          activations += 1
          if (activations === 2) {
            secondEntered.resolve()
            await releaseSecond.promise
          }
          return processCommunityActivityDigestDispatch(
            job as Job<CommunityActivityDigestDispatchData>,
            {
              createCommunityActivityDigestBatch: input =>
                createCommunityActivityDigestBatch({
                  ...input,
                  afterUserId: input.afterUserId ?? beforeTestDigestUserId(first),
                  throughUserId: second,
                  now,
                }),
              isCommunityActivityDigestWindowComplete: windowEnd =>
                isCommunityActivityDigestWindowComplete(windowEnd, { query }),
              advanceCommunityActivityDigestCursor: (windowStart, windowEnd) =>
                advanceCommunityActivityDigestCursor(windowStart, windowEnd, { query }),
            },
          )
        },
      })
      owner.beforeRelease(async () => {
        releaseSecond.resolve()
        await harness.close()
      })
      try {
        const queue = redirectBackgroundQueue(harness.queue)
        const [job] = await enqueueCommunityActivityDigestWindows([windowData(start, end)])
        if (!job) throw new Error('Expected native digest job')
        await waitForRealGlideEvent(secondEntered.promise, 'digest second recipient page')
        const checkpoint = await queue.getJob(job.id)
        expect(checkpoint?.data).toEqual(expect.objectContaining({ afterUserId: first }))
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(start)
        expect(await readTestCommunityActivityDigestDelivery(first, start)).toEqual({
          notification_count: 1,
          intent_count: 1,
        })
        expect(await readTestCommunityActivityDigestDelivery(second, start)).toEqual({
          notification_count: 0,
          intent_count: 0,
        })
        releaseSecond.resolve()
        expect(await harness.settled(job)).toBe('completed')
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(end)
        expect(await readTestCommunityActivityDigestDelivery(second, start)).toEqual({
          notification_count: 1,
          intent_count: 1,
        })
        expect(harness.stalledJobIds).toEqual([])
      } finally {
        releaseSecond.resolve()
        await harness.close()
      }
    })
  })

  it('acknowledges an already-complete window without writing its recipient digest', async () => {
    const { now, start, end } = ownedWindow()
    const [user] = await createTestDigestAdjacentUsers()
    await addTestDigestMember(user, now)
    await withTestCommunityActivityDigestCursor(end, async (query, owner) => {
      const harness = await startRealGlideBackgroundLifecycle({
        queueNamePrefix: 'community_digest_complete',
        connection,
        workerOptions: { blockTimeout: 100 },
        processor: (job): Promise<unknown> =>
          job.name !== NOTIFICATIONS_DIGEST_DISPATCH_JOB.name
            ? Promise.resolve()
            : processCommunityActivityDigestDispatch(
                job as Job<CommunityActivityDigestDispatchData>,
                {
                  createCommunityActivityDigestBatch: input =>
                    createCommunityActivityDigestBatch({
                      ...input,
                      afterUserId: beforeTestDigestUserId(user),
                      throughUserId: user,
                      now,
                    }),
                  isCommunityActivityDigestWindowComplete: windowEnd =>
                    isCommunityActivityDigestWindowComplete(windowEnd, { query }),
                  advanceCommunityActivityDigestCursor: (windowStart, windowEnd) =>
                    advanceCommunityActivityDigestCursor(windowStart, windowEnd, { query }),
                },
              ),
      })
      owner.beforeRelease(() => harness.close())
      try {
        redirectBackgroundQueue(harness.queue)
        const [job] = await enqueueCommunityActivityDigestWindows([windowData(start, end)])
        if (!job) throw new Error('Expected native digest job')
        expect(await harness.settled(job)).toBe('completed')
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(end)
        expect(await readTestCommunityActivityDigestDelivery(user, start)).toEqual({
          notification_count: 0,
          intent_count: 0,
        })
      } finally {
        await harness.close()
      }
    })
  })

  it('defers a live window while the real queue is over its depth cap', async () => {
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      background_max_depth: 1,
    })
    onTestFinished(restore)
    const { now, start, end } = ownedWindow()
    const [user] = await createTestDigestAdjacentUsers()
    await addTestDigestMember(user, now)
    await withTestCommunityActivityDigestCursor(start, async (query, owner) => {
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const harness = await startRealGlideBackgroundLifecycle({
        queueNamePrefix: 'community_digest_backlog',
        connection,
        workerOptions: { blockTimeout: 100 },
        processor: async (job): Promise<unknown> => {
          if (job.name !== NOTIFICATIONS_DIGEST_DISPATCH_JOB.name) return
          entered.resolve()
          await release.promise
          return processCommunityActivityDigestDispatch(
            job as Job<CommunityActivityDigestDispatchData>,
            {
              createCommunityActivityDigestBatch: input =>
                createCommunityActivityDigestBatch({
                  ...input,
                  afterUserId: beforeTestDigestUserId(user),
                  throughUserId: user,
                  now,
                }),
              isCommunityActivityDigestWindowComplete: windowEnd =>
                isCommunityActivityDigestWindowComplete(windowEnd, { query }),
              advanceCommunityActivityDigestCursor: (windowStart, windowEnd) =>
                advanceCommunityActivityDigestCursor(windowStart, windowEnd, { query }),
            },
          )
        },
      })
      owner.beforeRelease(async () => {
        release.resolve()
        await harness.close()
      })
      const events = new QueueEvents(harness.queue.name, { ...connection, lastEventId: '0' })
      owner.beforeRelease(() => events.close())
      try {
        await events.waitUntilReady()
        const queue = redirectBackgroundQueue(harness.queue)
        const [job] = await enqueueCommunityActivityDigestWindows([windowData(start, end)])
        if (!job) throw new Error('Expected native digest job')
        await waitForRealGlideEvent(entered.promise, 'digest backlog gate')
        const marker = await harness.add({ name: 'test.digest-backlog-marker', options: {} }, {})
        const delayed = waitForRealGlideEvent(
          once(events, 'delay-changed'),
          'digest backlog deferral',
        )
        release.resolve()
        const [delay] = await delayed
        expect((delay as { jobId: string }).jobId).toBe(job.id)
        expect(await harness.settled(marker)).toBe('completed')
        expect((await queue.getJobs('delayed')).map(queued => queued.id)).toContain(job.id)
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(start)
        expect(await readTestCommunityActivityDigestDelivery(user, start)).toEqual({
          notification_count: 0,
          intent_count: 0,
        })
      } finally {
        release.resolve()
        await events.close()
        await harness.close()
      }
    })
  })
})
