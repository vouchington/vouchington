import { describe, expect, it, onTestFinished } from 'vitest'
import {
  withCommittedPostgresTransactionForTest,
  withPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import {
  insertOperationalLocalPostForTest,
  insertOperationalRemoteActorForTest,
  operationalRowExistsForTest,
  readOperationalLikeIdentityForTest,
  hardDeleteTestPost,
  deleteOperationalRetainedLikeReferenceForTest,
} from '@voucha/test-helpers'
import {
  setTerminalActivityTimeForTest,
  removeTerminalLikePayloadForTest,
} from '@voucha/test-helpers/activitypub-terminal-identities'
import { getTerminalActivityIdentityRetentionDays } from '@services/ap-inbox-activities/config'
import { recordLike, undoLike } from '@services/ap-post-likes'
import { deleteTerminalRetentionFixtureForTest } from '@voucha/test-helpers/terminal-retention-cleanup'
import { cleanupActivityPubTerminalIdentities } from '../cleanup-activitypub-tombstones.mts'

describe('retained Like activity terminal cleanup', () => {
  it('caps identity candidates, deletes their terminal payload first, and preserves active/recent cycles', async () => {
    const fixture = await withCommittedPostgresTransactionForTest(async query => {
      const now = new Date()
      const cutoff = new Date(
        now.getTime() - getTerminalActivityIdentityRetentionDays() * 86_400_000,
      )
      const actor = await insertOperationalRemoteActorForTest(query, now)
      const verifiedActor = { id: actor.id, actor_uri: actor.actorUri }
      const { postId, userId } = await insertOperationalLocalPostForTest(query)
      const outsideId = `${actor.actorUri}/likes/outside-scope`
      await recordLike(postId, actor.id, outsideId, { query })
      await undoLike(postId, verifiedActor, outsideId, { query })
      await setTerminalActivityTimeForTest(query, 'like', outsideId, new Date(cutoff.getTime() - 3))
      const outsideIdentity = (await readOperationalLikeIdentityForTest(query, outsideId))!
      const oldId = `${actor.actorUri}/likes/old`
      const nextOldId = `${actor.actorUri}/likes/next-old`
      const recentId = `${actor.actorUri}/likes/recent`
      const activeId = `${actor.actorUri}/likes/active`
      await recordLike(postId, actor.id, oldId, { query })
      await undoLike(postId, verifiedActor, oldId, { query })
      await setTerminalActivityTimeForTest(query, 'like', oldId, new Date(cutoff.getTime() - 2))
      await recordLike(postId, actor.id, nextOldId, { query })
      await undoLike(postId, verifiedActor, nextOldId, { query })
      await setTerminalActivityTimeForTest(query, 'like', nextOldId, new Date(cutoff.getTime() - 1))
      await undoLike(postId, verifiedActor, recentId, { query })
      await setTerminalActivityTimeForTest(query, 'like', recentId, cutoff)
      await recordLike(postId, actor.id, activeId, { query })
      const oldIdentity = (await readOperationalLikeIdentityForTest(query, oldId))!
      const nextOldIdentity = (await readOperationalLikeIdentityForTest(query, nextOldId))!
      const recentIdentity = (await readOperationalLikeIdentityForTest(query, recentId))!
      const activeIdentity = (await readOperationalLikeIdentityForTest(query, activeId))!
      const activityIds = [oldId, nextOldId, recentId, activeId, outsideId]
      onTestFinished(async () => {
        await hardDeleteTestPost(postId)
        await withCommittedPostgresTransactionForTest(cleanupQuery =>
          Promise.all(
            activityIds.map(id => deleteOperationalRetainedLikeReferenceForTest(cleanupQuery, id)),
          ),
        )
        await deleteTerminalRetentionFixtureForTest({
          actorId: actor.id,
          actorUri: actor.actorUri,
          userId,
          activityIds,
        })
      })
      return {
        now,
        oldId,
        nextOldId,
        recentId,
        activeId,
        oldIdentity,
        nextOldIdentity,
        recentIdentity,
        activeIdentity,
        outsideIdentity,
        outsideId,
      }
    })
    const {
      now,
      oldId,
      nextOldId,
      recentId,
      activeId,
      oldIdentity,
      nextOldIdentity,
      recentIdentity,
      activeIdentity,
      outsideIdentity,
      outsideId,
    } = fixture
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now,
      identityIds: [oldIdentity.id, nextOldIdentity.id, recentIdentity.id, activeIdentity.id],
    }
    const first = await cleanupActivityPubTerminalIdentities('like', options)
    expect(first.deleted).toBe(1)
    expect(first.hasMore).toBe(true)
    await withPostgresTransactionForTest(async query => {
      expect(await readOperationalLikeIdentityForTest(query, oldId)).toBeNull()
      expect(
        await operationalRowExistsForTest(query, 'activitypub_post_likes', oldIdentity.id),
      ).toBe(false)
      expect(await readOperationalLikeIdentityForTest(query, nextOldId)).toEqual(nextOldIdentity)
      expect(
        await operationalRowExistsForTest(query, 'activitypub_post_likes', nextOldIdentity.id),
      ).toBe(true)
      expect(await readOperationalLikeIdentityForTest(query, recentId)).toEqual(recentIdentity)
      expect(await readOperationalLikeIdentityForTest(query, activeId)).toEqual(activeIdentity)
    })
    const second = await cleanupActivityPubTerminalIdentities('like', options)
    expect(second.deleted).toBe(1)
    expect(second.hasMore).toBe(true)
    await withPostgresTransactionForTest(async query => {
      expect(await readOperationalLikeIdentityForTest(query, nextOldId)).toBeNull()
    })
    const exhausted = await cleanupActivityPubTerminalIdentities('like', options)
    expect(exhausted.deleted).toBe(0)
    expect(exhausted.hasMore).toBe(false)
    await withPostgresTransactionForTest(async query => {
      expect(
        await operationalRowExistsForTest(query, 'activitypub_post_likes', outsideIdentity.id),
      ).toBe(true)
      expect(await readOperationalLikeIdentityForTest(query, outsideId)).toEqual(outsideIdentity)
    })
  })

  it('expires exact terminal replay scope after the shorter payload cleanup has removed its child', async () => {
    const fixture = await withCommittedPostgresTransactionForTest(async query => {
      const now = new Date()
      const actor = await insertOperationalRemoteActorForTest(query, now)
      const { postId, userId } = await insertOperationalLocalPostForTest(query)
      const activityId = `${actor.actorUri}/likes/payload-removed`
      await undoLike(postId, { id: actor.id, actor_uri: actor.actorUri }, activityId, { query })
      const identity = (await readOperationalLikeIdentityForTest(query, activityId))!
      const cutoff = new Date(
        now.getTime() - getTerminalActivityIdentityRetentionDays() * 86_400_000,
      )
      await setTerminalActivityTimeForTest(
        query,
        'like',
        activityId,
        new Date(cutoff.getTime() - 1),
      )
      await removeTerminalLikePayloadForTest(query, identity.id)
      onTestFinished(async () => {
        await hardDeleteTestPost(postId)
        await withCommittedPostgresTransactionForTest(cleanupQuery =>
          deleteOperationalRetainedLikeReferenceForTest(cleanupQuery, activityId),
        )
        await deleteTerminalRetentionFixtureForTest({
          actorId: actor.id,
          actorUri: actor.actorUri,
          userId,
          activityIds: [activityId],
        })
      })
      return { now, activityId, identity }
    })
    const { now, activityId, identity } = fixture
    const result = await cleanupActivityPubTerminalIdentities('like', {
      batchSize: 1,
      maxBatches: 1,
      now,
      identityIds: [identity.id],
    })
    expect(result.deleted).toBe(1)
    expect(result.hasMore).toBe(true)
    await withPostgresTransactionForTest(async query => {
      expect(await readOperationalLikeIdentityForTest(query, activityId)).toBeNull()
    })
  })
})
