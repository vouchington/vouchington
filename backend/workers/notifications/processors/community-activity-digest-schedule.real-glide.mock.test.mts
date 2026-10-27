import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import {
  beforeTestDigestUserId,
  createTestDigestAdjacentUsers,
  getTestCommunityActivityDigestQueueConnection,
  readTestCommunityActivityDigestCursor,
  withTestCommunityActivityDigestCursor,
} from '@voucha/test-helpers/community-activity-digest-dispatch'
import { NOTIFICATIONS_DIGEST_DISPATCH_JOB } from '@queues/background/enqueues/notifications-jobs'
import { redirectBackgroundQueue } from '@voucha/test-helpers/background-queue-redirect'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { createCommunityActivityDigestBatch } from '@services/notifications/community-activity-digest'
import {
  advanceCommunityActivityDigestCursor,
  isCommunityActivityDigestWindowComplete,
  prepareCommunityActivityDigestWindows,
} from '@services/notifications/community-activity-digest-dispatch'
import {
  communityActivityDigestWindowJobId,
  enqueueCommunityActivityDigestWindows,
  type CommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues/community-activity-digest'
import { processCommunityActivityDigestDispatch } from './community-activity-digest.mts'
import { processCommunityActivityDigestScheduleTick } from './community-activity-digest-schedule.mts'

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

function windowData(start: Date, end: Date): CommunityActivityDigestDispatchData {
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() }
}

describe('community digest gap recovery through the native queue', () => {
  it('replays a failed predecessor before a later completed window can advance the cursor', async () => {
    const now = new Date()
    const start = new Date(now)
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    const end = new Date(start.getTime() + WEEK_MS)
    const laterEnd = new Date(end.getTime() + WEEK_MS)
    const [user] = await createTestDigestAdjacentUsers()
    await withTestCommunityActivityDigestCursor(start, async (query, owner) => {
      const recoveredFirst = Promise.withResolvers<void>()
      const recoveredLater = Promise.withResolvers<void>()
      void recoveredFirst.promise.catch(() => undefined)
      void recoveredLater.promise.catch(() => undefined)
      const runs = new Map<string, number>()
      let rejectFirstAdvance = true
      const harness = await startRealGlideBackgroundLifecycle({
        queueNamePrefix: 'community_digest_gap',
        connection,
        workerOptions: { blockTimeout: 100 },
        processor: async (job): Promise<void> => {
          if (job.name !== NOTIFICATIONS_DIGEST_DISPATCH_JOB.name) return
          const key = (job.data as CommunityActivityDigestDispatchData).windowStart
          const count = (runs.get(key) ?? 0) + 1
          runs.set(key, count)
          try {
            await processCommunityActivityDigestDispatch(
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
                advanceCommunityActivityDigestCursor: (windowStart, windowEnd) => {
                  if (windowStart.getTime() !== start.getTime() || !rejectFirstAdvance)
                    return advanceCommunityActivityDigestCursor(windowStart, windowEnd, { query })
                  rejectFirstAdvance = false
                  return advanceCommunityActivityDigestCursor(windowStart, windowEnd, {
                    query: rejectQuery(
                      query,
                      statement => statement.includes('advanceCommunityActivityDigestCursor'),
                      'injected predecessor cursor failure',
                    ),
                  })
                },
              },
            )
            if (count === 2) {
              if (key === start.toISOString()) recoveredFirst.resolve()
              if (key === end.toISOString()) recoveredLater.resolve()
            }
          } catch (err) {
            if (count === 2) {
              if (key === start.toISOString()) recoveredFirst.reject(err)
              if (key === end.toISOString()) recoveredLater.reject(err)
            }
            throw err
          }
        },
      })
      owner.beforeRelease(() => harness.close())
      redirectBackgroundQueue(harness.queue)
      const tick = (target: Date) =>
        processCommunityActivityDigestScheduleTick(
          { targetWindowStart: target.toISOString() },
          {
            prepareCommunityActivityDigestWindows: date =>
              prepareCommunityActivityDigestWindows(date, { query }),
          },
        )
      try {
        await tick(start)
        const firstJobId = communityActivityDigestWindowJobId(windowData(start, end))
        expect(await harness.settled({ id: firstJobId })).toBe('failed')
        const [later] = await enqueueCommunityActivityDigestWindows([windowData(end, laterEnd)])
        if (!later) throw new Error('Expected later digest window job')
        expect(await harness.settled(later)).toBe('completed')
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(start)
        await tick(end)
        await waitForRealGlideEvent(
          Promise.all([recoveredFirst.promise, recoveredLater.promise]),
          'digest failed-window recovery',
        )
        expect(await readTestCommunityActivityDigestCursor(query)).toEqual(laterEnd)
        expect(runs.get(start.toISOString())).toBe(2)
        expect(runs.get(end.toISOString())).toBe(2)
      } finally {
        await harness.close()
      }
    })
  })
})
