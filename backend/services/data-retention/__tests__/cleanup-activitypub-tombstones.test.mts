import { describe, expect, it } from 'vitest'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  insertOperationalLocalPostForTest,
  insertOperationalRemoteActorForTest,
  operationalRowExistsForTest,
  readOperationalLikeIdentityForTest,
} from '@voucha/test-helpers'
import {
  setTerminalActivityTimeForTest,
  scopeTerminalActivityQueryForTest,
  removeTerminalLikePayloadForTest,
} from '@voucha/test-helpers/activitypub-terminal-identities'
import { getTerminalActivityIdentityRetentionDays } from '@services/ap-inbox-activities/config'
import { recordLike, undoLike } from '@services/ap-post-likes'
import { cleanupActivityPubTerminalIdentityPage } from '../cleanup-activitypub-tombstones.mts'

describe('retained Like activity terminal cleanup', () => {
  it('caps identity candidates, deletes their terminal payload first, and preserves active/recent cycles', async () => {
    await withPostgresTransactionForTest(async query => {
      const now = new Date()
      const cutoff = new Date(
        now.getTime() - getTerminalActivityIdentityRetentionDays() * 86_400_000,
      )
      const actor = await insertOperationalRemoteActorForTest(query, now)
      const verifiedActor = { id: actor.id, actor_uri: actor.actorUri }
      const { postId } = await insertOperationalLocalPostForTest(query)
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
      const scoped = scopeTerminalActivityQueryForTest(query, 'like', [
        oldIdentity.id,
        nextOldIdentity.id,
        recentIdentity.id,
        activeIdentity.id,
      ])
      expect(await cleanupActivityPubTerminalIdentityPage(scoped, 'like', cutoff, 1)).toBe(1)
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
      expect(await cleanupActivityPubTerminalIdentityPage(scoped, 'like', cutoff, 1)).toBe(1)
      expect(await readOperationalLikeIdentityForTest(query, nextOldId)).toBeNull()
      expect(await cleanupActivityPubTerminalIdentityPage(scoped, 'like', cutoff, 1)).toBe(0)
    })
  })

  it('expires exact terminal replay scope after the shorter payload cleanup has removed its child', async () => {
    await withPostgresTransactionForTest(async query => {
      const now = new Date()
      const actor = await insertOperationalRemoteActorForTest(query, now)
      const { postId } = await insertOperationalLocalPostForTest(query)
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
      const scoped = scopeTerminalActivityQueryForTest(query, 'like', [identity.id])
      expect(await cleanupActivityPubTerminalIdentityPage(scoped, 'like', cutoff, 1)).toBe(1)
      expect(await readOperationalLikeIdentityForTest(query, activityId)).toBeNull()
    })
  })
})
