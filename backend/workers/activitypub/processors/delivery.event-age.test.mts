import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { getMinUuidv7ForDate } from '@modules/utils/ids'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import { distributeActivity } from './delivery.mts'

describe('Like and UndoLike age', () => {
  it('comes from the ballot event id, not the hashed activity id', async () => {
    const hashedId = randomUUID()
    const base = { sourceUserId: randomUUID(), targetPostId: randomUUID(), activityId: hashedId }
    const expiredEventId = getMinUuidv7ForDate(
      new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * 86_400_000),
    )
    await expect(
      distributeActivity({ ...base, activityType: 'Like', eventId: expiredEventId }),
    ).resolves.toEqual({ enqueued: 0, completed: true, reason: 'expired-activity' })
    await expect(
      distributeActivity({
        ...base,
        activityType: 'UndoLike',
        originalActivityId: hashedId,
        eventId: expiredEventId,
      }),
    ).resolves.toEqual({ enqueued: 0, completed: true, reason: 'expired-activity' })
    await expect(
      distributeActivity({ ...base, activityType: 'Like', eventId: hashedId }),
    ).resolves.toEqual({ enqueued: 0, completed: true, reason: 'unsupported-activity-id' })
  })
})
