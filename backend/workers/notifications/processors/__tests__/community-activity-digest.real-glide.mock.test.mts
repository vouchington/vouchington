import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import {
  insertTestCommunity,
  insertTestCommunityMember,
  archiveTestCommunity,
} from '@voucha/test-helpers'
import {
  createTestDigestAdjacentUsers,
  getTestCommunityActivityDigestQueueConnection,
  readTestCommunityActivityDigestCursor,
  readTestCommunityActivityDigestDelivery,
  withTestCommunityActivityDigestCursor,
} from '@voucha/test-helpers/community-activity-digest-dispatch'
import { withTestDigestClock } from '@voucha/test-helpers/community-activity-digest-clock'
import { redirectBackgroundQueue } from '@voucha/test-helpers/background-queue-redirect'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { notificationsWorkConfig } from '@services/notifications/work-limits'
import { NOTIFICATIONS_DIGEST_DISPATCH_JOB } from '@queues/background/enqueues/notifications-jobs'
import {
  enqueueCommunityActivityDigestWindows,
  type CommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues/community-activity-digest'
import { processCommunityActivityDigestDispatch } from '../community-activity-digest.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())
vi.mock<typeof import('@vouchington/worker-runtime/glide-mq')>(
  import('@vouchington/worker-runtime/glide-mq'),
  async original =>
    (
      await import('@voucha/test-helpers/background-queue-redirect')
    ).withRedirectableBackgroundQueue(await original()),
)

const connection = getTestCommunityActivityDigestQueueConnection()

describe('community digest membership cursor', () => {
  it(
    'checkpoints within a user after an empty page and clears that position after emission',
    withTestDigestClock(async now => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
          community_digest_recipient_batch_size: 1,
        }),
      )
      const [first, second] = await createTestDigestAdjacentUsers()
      const firstCommunities = (
        await Promise.all([
          insertTestCommunity({ createdById: first }),
          insertTestCommunity({ createdById: first }),
          insertTestCommunity({ createdById: first }),
        ])
      ).toSorted((a, b) => a.id.localeCompare(b.id))
      for (const community of firstCommunities) {
        await insertTestCommunityMember({
          communityId: community.id,
          userId: first,
          role: 'moderator',
          createdAt: now,
        })
      }
      await archiveTestCommunity({ communityId: firstCommunities[0]!.id, archivedById: first })
      const secondCommunity = await insertTestCommunity({ createdById: second })
      await insertTestCommunityMember({
        communityId: secondCommunity.id,
        userId: second,
        role: 'moderator',
        createdAt: now,
      })
      const start = new Date(now)
      start.setUTCHours(0, 0, 0, 0)
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
      await withTestCommunityActivityDigestCursor(start, async (query, owner) => {
        const secondEntered = Promise.withResolvers<void>()
        const thirdEntered = Promise.withResolvers<void>()
        const releaseSecond = Promise.withResolvers<void>()
        const releaseThird = Promise.withResolvers<void>()
        let activations = 0
        const harness = await startRealGlideBackgroundLifecycle({
          queueNamePrefix: 'digest_membership_cursor',
          connection,
          workerOptions: { blockTimeout: 100 },
          processor: async job => {
            if (job.name !== NOTIFICATIONS_DIGEST_DISPATCH_JOB.name) return undefined
            activations += 1
            if (activations === 2) {
              secondEntered.resolve()
              await releaseSecond.promise
            }
            if (activations === 3) {
              thirdEntered.resolve()
              await releaseThird.promise
            }
            return processCommunityActivityDigestDispatch(
              job as Job<CommunityActivityDigestDispatchData>,
              [first, second],
              1,
              { query, now },
            )
          },
        })
        owner.beforeRelease(async () => {
          releaseSecond.resolve()
          releaseThird.resolve()
          await harness.close()
        })
        try {
          const queue = redirectBackgroundQueue(harness.queue)
          const [job] = await enqueueCommunityActivityDigestWindows([
            { windowStart: start.toISOString(), windowEnd: end.toISOString() },
          ])
          if (!job) throw new Error('Expected retained digest window')
          await waitForRealGlideEvent(
            secondEntered.promise,
            'digest empty membership page checkpoint',
          )
          expect((await queue.getJob(job.id))?.data).toEqual(
            expect.objectContaining({
              afterUserId: first,
              afterCommunityId: firstCommunities[0]!.id,
              throughUserId: second,
            }),
          )
          releaseSecond.resolve()
          await waitForRealGlideEvent(thirdEntered.promise, 'digest emitted user checkpoint')
          expect((await queue.getJob(job.id))?.data).toEqual(
            expect.objectContaining({
              afterUserId: first,
              afterCommunityId: null,
              throughUserId: second,
            }),
          )
          expect(await readTestCommunityActivityDigestDelivery(first, start)).toEqual({
            notification_count: 1,
            intent_count: 1,
          })
          expect(await readTestCommunityActivityDigestDelivery(second, start)).toEqual({
            notification_count: 0,
            intent_count: 0,
          })
          releaseThird.resolve()
          expect(await harness.settled(job)).toBe('completed')
          expect(await readTestCommunityActivityDigestCursor(query)).toEqual(end)
          expect(await readTestCommunityActivityDigestDelivery(first, start)).toEqual({
            notification_count: 1,
            intent_count: 1,
          })
          expect(await readTestCommunityActivityDigestDelivery(second, start)).toEqual({
            notification_count: 1,
            intent_count: 1,
          })
        } finally {
          releaseSecond.resolve()
          releaseThird.resolve()
          await harness.close()
        }
      })
    }),
  )
})
