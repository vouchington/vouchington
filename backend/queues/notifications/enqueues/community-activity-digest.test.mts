import { describe, expect, it } from 'vitest'
import {
  enqueueCommunityActivityDigestBatch,
  enqueueCommunityActivityDigestDispatch,
  getCommunityActivityDigestDispatchData,
} from './community-activity-digest.mts'
import { notifications } from '../queues.mts'
import { enqueueBulkDeliverNotificationPushIntents } from '../enqueues.mts'
import { upsertSchedules } from './schedules.mts'
import { COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS } from '@voucha/types/community-activity-digest'

describe('community activity digest queue wiring', () => {
  it('persists the previous closed UTC week in dispatch data', () => {
    expect(getCommunityActivityDigestDispatchData(new Date('2026-07-15T18:42:00.000Z'))).toEqual({
      windowStart: '2026-07-06T00:00:00.000Z',
      windowEnd: '2026-07-13T00:00:00.000Z',
    })
  })
  it('assigns simultaneous and retried cursor jobs the same throttle identity', async () => {
    await enqueueCommunityActivityDigestDispatch()
    const batch = {
      windowStart: '2026-07-06T00:00:00.000Z',
      windowEnd: '2026-07-13T00:00:00.000Z',
      afterUserId: '00000000-0000-7000-8000-000000000001',
    }
    await Promise.all([
      enqueueCommunityActivityDigestBatch(batch),
      enqueueCommunityActivityDigestBatch(batch),
    ])
    await enqueueCommunityActivityDigestBatch(batch)

    const jobs = await notifications.getJobs('waiting')
    const dispatch = jobs.find(job => job.name === 'processCommunityActivityDigestDispatch')
    const cursors = jobs.filter(
      job =>
        job.name === 'processCommunityActivityDigestBatch' &&
        (job.data as { windowStart?: string }).windowStart === batch.windowStart &&
        (job.data as { afterUserId?: string }).afterUserId === batch.afterUserId,
    )
    expect(dispatch?.opts.deduplication).toMatchObject({ mode: 'throttle' })
    // The shim's dedup, faithful to production's throttle window, collapses all three attempts
    // (the two simultaneous ones and the retry) onto the same throttle identity: only the one that
    // reaches the dedup check first actually enqueues.
    expect(cursors).toHaveLength(1)
    expect(cursors[0]?.opts.deduplication).toEqual({
      id: `processCommunityActivityDigestBatch__${batch.windowStart}__${batch.afterUserId}`,
      mode: 'throttle',
      ttl: COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS,
    })
    expect(cursors[0]?.opts).toMatchObject({ attempts: 3, priority: 10 })
  })

  it('deduplicates durable push-intent jobs by notification identity', async () => {
    const notification = {
      userId: '00000000-0000-7000-8000-000000000002',
      notificationId: '00000000-0000-7000-8000-000000000003',
    }

    await enqueueBulkDeliverNotificationPushIntents([notification, notification])

    const jobs = await notifications.getJobs('waiting')
    const pushIntents = jobs.filter(
      job =>
        job.name === 'processDeliverNotificationPushIntent' &&
        (job.data as { notificationId?: string }).notificationId === notification.notificationId,
    )
    expect(pushIntents).toHaveLength(1)
    expect(pushIntents[0]?.opts.deduplication).toEqual({
      id: `processDeliverNotificationPushIntent__${notification.userId}__${notification.notificationId}`,
      mode: 'debounce',
      ttl: 30_000,
    })
  })

  it('registers the Monday 09:00 UTC scheduler', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })
})
