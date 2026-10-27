import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Queue, type Job } from 'glide-mq'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import {
  getTestCommunityActivityDigestQueueConnection,
  beforeTestDigestUserId,
  readTestCommunityActivityDigestCursor,
  readTestCommunityActivityDigestDelivery,
  withTestCommunityActivityDigestCursor,
} from '@voucha/test-helpers/community-activity-digest-dispatch'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users-direct'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import { insertTestCommunityMember } from '@voucha/test-helpers/entities/community-members'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { createCommunityActivityDigestBatch } from './community-activity-digest.mts'
import { notifications } from '../../queues/notifications/queues.mts'
import {
  advanceCommunityActivityDigestCursor,
  isCommunityActivityDigestWindowComplete,
  prepareCommunityActivityDigestWindows,
} from './community-activity-digest-dispatch.mts'
import {
  communityActivityDigestWindowJobId,
  enqueueCommunityActivityDigestWindows,
} from '../../queues/notifications/enqueues/community-activity-digest.mts'
import type { CommunityActivityDigestDispatchData } from '../../queues/background/enqueues/notifications-domain.mts'
import { processCommunityActivityDigestDispatch } from '../../workers/notifications/processors/community-activity-digest.mts'
import { processCommunityActivityDigestScheduleTick } from '../../workers/notifications/processors/community-activity-digest-schedule.mts'

// This project replaces its default transport shim with the real external package.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

describe('community activity digest real queue admission', () => {
  it('publishes the epoch identity and digest lane through the registered producer', async () => {
    const start = new Date(Date.UTC(2400, 0, 1) + Number.parseInt(randomUUID().slice(0, 8), 16))
    const window = {
      windowStart: start.toISOString(),
      windowEnd: new Date(start.getTime() + WEEK_MS).toISOString(),
    }
    const id = `digest__${start.getTime()}`
    try {
      const [job] = await enqueueCommunityActivityDigestWindows([window])
      expect(job?.id).toBe(id)
      const stored = await notifications.getJob(id)
      expect(stored?.data).toEqual(window)
      expect(stored?.opts.ordering).toEqual(
        expect.objectContaining({ key: 'notifications:digest-windows' }),
      )
    } finally {
      await (await notifications.getJob(id))?.remove()
    }
  })

  it('reactivates a failed stable window on the next tick without duplicating its delivery', async () => {
    const businessNow = new Date()
    const windowStart = new Date(businessNow)
    windowStart.setUTCHours(0, 0, 0, 0)
    windowStart.setUTCDate(windowStart.getUTCDate() - ((windowStart.getUTCDay() + 6) % 7))
    const windowEnd = new Date(windowStart.getTime() + WEEK_MS)
    const user = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
      createdAt: businessNow,
    })
    await insertTestPost({
      title: 'Digest dispatch recovery',
      slug: `digest-dispatch-recovery-${user.id}`,
      markdown: 'A post in the owned week.',
      createdById: user.id,
      communityId: community.id,
      createdAt: businessNow,
    })

    await withTestCommunityActivityDigestCursor(windowStart, async (query, owner) => {
      let failAdvance = true
      let runs = 0
      const replaySettled = Promise.withResolvers<void>()
      void replaySettled.promise.catch(() => undefined)
      const harness = await startRealGlideBackgroundLifecycle({
        queueNamePrefix: 'community_digest_recovery',
        connection: getTestCommunityActivityDigestQueueConnection(),
        workerOptions: { blockTimeout: 100 },
        processor: async job => {
          runs += 1
          try {
            await processCommunityActivityDigestDispatch(
              job as Job<CommunityActivityDigestDispatchData>,
              {
                createCommunityActivityDigestBatch: input =>
                  createCommunityActivityDigestBatch({
                    ...input,
                    afterUserId: beforeTestDigestUserId(user.id),
                    throughUserId: user.id,
                    now: businessNow,
                  }),
                isCommunityActivityDigestWindowComplete: end =>
                  isCommunityActivityDigestWindowComplete(end, { query }),
                advanceCommunityActivityDigestCursor: (start, end) => {
                  if (!failAdvance)
                    return advanceCommunityActivityDigestCursor(start, end, { query })
                  failAdvance = false
                  return advanceCommunityActivityDigestCursor(start, end, {
                    query: rejectQuery(
                      query,
                      statement => statement.includes('advanceCommunityActivityDigestCursor'),
                      'injected failure after recipient write',
                    ),
                  })
                },
                getJobCounts: () => harness.queue.getJobCounts(),
              },
            )
            if (runs === 2) replaySettled.resolve()
          } catch (err) {
            if (runs === 2) replaySettled.reject(err)
            throw err
          }
        },
      })
      owner.beforeRelease(() => harness.close())
      const queue = Object.assign(harness.queue, { priorityKind: 'ranked' as const })
      try {
        const tick = () =>
          processCommunityActivityDigestScheduleTick(
            { targetWindowStart: windowStart.toISOString() },
            {
              prepareCommunityActivityDigestWindows: target =>
                prepareCommunityActivityDigestWindows(target, { query }),
              enqueueCommunityActivityDigestWindows: windows =>
                enqueueCommunityActivityDigestWindows(windows, {
                  queue,
                  retry: { attempts: 1 },
                }),
            },
          )
        await tick()
        const jobId = `digest__${windowStart.getTime()}`
        expect(await harness.settled({ id: jobId })).toBe('failed')
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(windowStart)
        expect(await readTestCommunityActivityDigestDelivery(user.id, windowStart)).toEqual({
          notification_count: 1,
          intent_count: 1,
        })
        await tick()
        await waitForRealGlideEvent(replaySettled.promise, 'digest replay completion')
        expect(runs).toBe(2)
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(windowEnd)
        expect(await readTestCommunityActivityDigestDelivery(user.id, windowStart)).toEqual({
          notification_count: 1,
          intent_count: 1,
        })
        expect(harness.stalledJobIds).toEqual([])
      } finally {
        await harness.close()
      }
    })
  })

  it('admits one native job for duplicate window enqueue attempts', async () => {
    const queue = Object.assign(
      new Queue(
        `community_digest_dedup_${randomUUID()}`,
        getTestCommunityActivityDigestQueueConnection(),
      ),
      { priorityKind: 'ranked' as const },
    )
    try {
      const window = {
        windowStart: '2400-01-06T00:00:00.000Z',
        windowEnd: '2400-01-13T00:00:00.000Z',
      }
      const [first, duplicate] = await Promise.all([
        enqueueCommunityActivityDigestWindows([window], { queue }),
        enqueueCommunityActivityDigestWindows([window], { queue }),
      ])
      expect([...first, ...duplicate].map(job => job.id)).toEqual([
        communityActivityDigestWindowJobId(window),
      ])
      expect(await queue.getJob(communityActivityDigestWindowJobId(window))).toBeDefined()
    } finally {
      await queue.obliterate({ force: false })
      await queue.close()
    }
  })
})
