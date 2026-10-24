import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  countOperationalActiveLikesForTest,
  createTestExpiryWindow,
  insertOperationalInboxWorkForTest,
  insertOperationalLocalPostForTest,
  insertOperationalRemoteActorForTest,
  insertOperationalRemoteFollowForTest,
  insertOperationalUndoneFollowCycleForTest,
  operationalFollowCycleExistsForTest,
  operationalRowExistsForTest,
  readOperationalLikeIdentityForTest,
  readOperationalRemoteIdentityForTest,
  reinsertOperationalRemoteActorCacheForTest,
  resetOperationalRetentionCursorForTest,
  setOperationalLikeDeletedAtForTest,
} from '@voucha/test-helpers'
import { recordLike } from '../../ap-post-likes/record-like.mts'
import { undoLike } from '../../ap-post-likes/undo-like.mts'
import {
  markRemoteFollowUndone,
  reserveRemoteFollowCycle,
} from '../../ap-inbox-activities/follow-cycles.mts'
import { cleanupOperationalTombstones } from '../cleanup-operational-tombstones.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('ActivityPub operational retention', () => {
  it('expires an Undo payload while retaining its exact actor, target and activity replay identity', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'activitypub_post_likes')
    const { postId } = await insertOperationalLocalPostForTest(query)
    const actor = await insertOperationalRemoteActorForTest(query, window.afterUpperBoundDate)
    const oldActivity = `${actor.actorUri}/likes/old`
    const recentActivity = `${actor.actorUri}/likes/recent`
    await recordLike(postId, actor.id, oldActivity, { query })
    await undoLike(postId, actor.id, oldActivity, { query })
    const oldIdentity = (await readOperationalLikeIdentityForTest(query, oldActivity))!
    await setOperationalLikeDeletedAtForTest(query, oldIdentity.id, window.firstEligibleDate)
    await undoLike(postId, actor.id, recentActivity, { query })
    const recentIdentity = (await readOperationalLikeIdentityForTest(query, recentActivity))!
    await setOperationalLikeDeletedAtForTest(query, recentIdentity.id, window.afterUpperBoundDate)

    expect(
      await cleanupOperationalTombstones('activitypub_post_likes', {
        batchSize: 1,
        maxBatches: 1,
        now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
        lowerBoundDate: window.lowerBoundDate,
        borrowedQuery: query,
      }),
    ).toMatchObject({ deleted: 1, hasMore: false })
    expect(await operationalRowExistsForTest(query, 'activitypub_post_likes', oldIdentity.id)).toBe(
      false,
    )
    expect(await readOperationalLikeIdentityForTest(query, oldActivity)).toMatchObject({
      id: oldIdentity.id,
      undone_at: expect.any(Date),
    })
    expect(
      await operationalRowExistsForTest(query, 'activitypub_post_likes', recentIdentity.id),
    ).toBe(true)
    await recordLike(postId, actor.id, oldActivity, { query })
    expect(await countOperationalActiveLikesForTest(query, postId)).toBe(0)
    const otherActor = await insertOperationalRemoteActorForTest(query, window.afterUpperBoundDate)
    const { postId: otherPostId } = await insertOperationalLocalPostForTest(query)
    await undoLike(postId, otherActor.id, oldActivity, { query })
    await recordLike(postId, otherActor.id, oldActivity, { query })
    await undoLike(otherPostId, actor.id, oldActivity, { query })
    await recordLike(otherPostId, actor.id, oldActivity, { query })
    expect(await countOperationalActiveLikesForTest(query, postId)).toBe(0)
    expect(await countOperationalActiveLikesForTest(query, otherPostId)).toBe(0)
    await recordLike(postId, actor.id, `${actor.actorUri}/likes/fresh`, { query })
    expect(await countOperationalActiveLikesForTest(query, postId)).toBe(1)
  })

  it('evicts only unreferenced actor cache while retaining an undone Follow cycle identity', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'remote_actors')
    const { postId, userId } = await insertOperationalLocalPostForTest(query)
    const stale = await insertOperationalRemoteActorForTest(query, window.firstEligibleDate)
    const followed = await insertOperationalRemoteActorForTest(query, window.firstEligibleDate)
    const liked = await insertOperationalRemoteActorForTest(query, window.firstEligibleDate)
    const queued = await insertOperationalRemoteActorForTest(query, window.firstEligibleDate)
    const recent = await insertOperationalRemoteActorForTest(query, window.afterUpperBoundDate)
    const oldFollowActivity = await insertOperationalUndoneFollowCycleForTest(
      query,
      stale.id,
      userId,
    )
    await insertOperationalRemoteFollowForTest(query, followed.id, userId)
    await recordLike(postId, liked.id, `${liked.actorUri}/likes/live`, { query })
    await insertOperationalInboxWorkForTest(query, queued.id, queued.actorUri)

    expect(
      await cleanupOperationalTombstones('remote_actors', {
        batchSize: 1,
        maxBatches: 1,
        now: new Date(window.upperBoundDate.getTime() + 90 * DAY_MS),
        lowerBoundDate: window.lowerBoundDate,
        borrowedQuery: query,
      }),
    ).toMatchObject({ deleted: 1, hasMore: false })
    expect(await operationalRowExistsForTest(query, 'remote_actors', stale.id)).toBe(false)
    expect(await readOperationalRemoteIdentityForTest(query, stale.actorUri)).toBe(stale.id)
    expect(await operationalFollowCycleExistsForTest(query, oldFollowActivity)).toBe(true)
    const unverifiedFollow = `${stale.actorUri}/follows/unverified`
    expect(await markRemoteFollowUndone(unverifiedFollow, stale.id, userId, { query })).toBeNull()
    expect(await operationalFollowCycleExistsForTest(query, unverifiedFollow)).toBe(false)
    await reinsertOperationalRemoteActorCacheForTest(query, stale.id, stale.actorUri)
    expect(
      await reserveRemoteFollowCycle(oldFollowActivity, stale.id, userId, { query }),
    ).toMatchObject({ isNew: false, isUndone: true })
    await expect(
      reserveRemoteFollowCycle(oldFollowActivity, followed.id, userId, { query }),
    ).rejects.toThrow(/another actor or target/)
    const { userId: otherUserId } = await insertOperationalLocalPostForTest(query)
    await expect(
      reserveRemoteFollowCycle(oldFollowActivity, stale.id, otherUserId, { query }),
    ).rejects.toThrow(/another actor or target/)
    for (const actor of [followed, liked, queued, recent]) {
      expect(await operationalRowExistsForTest(query, 'remote_actors', actor.id)).toBe(true)
    }
  })
})
