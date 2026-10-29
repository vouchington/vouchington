import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestRetentionWindow,
  getTestUserRaw,
  hasTestRetainedIdentityRoot,
  insertOperationalLocalPostForTest,
  insertOperationalRemoteActorForTest,
  readOperationalLikeIdentityForTest,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  scopeTerminalActivityQueryForTest,
  setTerminalActivityTimeForTest,
} from '@voucha/test-helpers/activitypub-terminal-identities'
import { recordLike } from '../../ap-post-likes/record-like.mts'
import { cleanupActivityPubTerminalIdentityPage } from '../cleanup-activitypub-tombstones.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
import type { UserPurgeCursor } from '../user-purge-types.mts'

describe('final user purge of active remote Likes', () => {
  it('pages active identities before post cascade and later retires their retained post root', async () => {
    const { emptyPostId, postId, userId } = await withCommittedPostgresTransactionForTest(
      async query => {
        const first = await insertOperationalLocalPostForTest(query)
        const second = await insertOperationalLocalPostForTest(query, first.userId)
        return { emptyPostId: first.postId, postId: second.postId, userId: first.userId }
      },
    )
    expect(emptyPostId.localeCompare(postId)).toBeLessThan(0)
    const actor = await withCommittedPostgresTransactionForTest(query =>
      insertOperationalRemoteActorForTest(query, new Date()),
    )
    const activityIds = [`${actor.actorUri}/likes/first`, `${actor.actorUri}/likes/second`]
    for (const activityId of activityIds) await recordLike(postId, actor.id, activityId)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(userId, window.firstEligibleDate)

    let cursor: UserPurgeCursor | undefined
    let deleted = 0
    let passedEmptyPost = false
    for (let page = 0; page < 24; page++) {
      const result = await cleanupSoftDeletedUser(
        userId,
        window.upperBoundDate,
        undefined,
        1,
        { remainingRows: 1 },
        cursor,
      )
      cursor = result.userPurge
      if (cursor && 'postId' in cursor && cursor.postId === postId) passedEmptyPost = true
      deleted = result.deleted
      if (!result.hasMore) break
    }
    expect(deleted).toBe(1)
    expect(passedEmptyPost).toBe(true)
    expect(await getTestUserRaw(userId)).toBeNull()

    await using query = await beginTransaction()
    for (const activityId of activityIds)
      expect(await readOperationalLikeIdentityForTest(query, activityId)).toMatchObject({
        undone_at: expect.any(Date),
      })
    await cleanupRetainedIdentityRoots(1_000, { post: [postId] })
    expect(await hasTestRetainedIdentityRoot('post', postId)).toBe(true)

    const cutoff = new Date()
    const expired = new Date(cutoff.getTime() - 1_000)
    for (const activityId of activityIds)
      await setTerminalActivityTimeForTest(query, 'like', activityId, expired)
    const ids = await Promise.all(
      activityIds.map(
        async activityId => (await readOperationalLikeIdentityForTest(query, activityId))!.id,
      ),
    )
    expect(
      await cleanupActivityPubTerminalIdentityPage(
        scopeTerminalActivityQueryForTest(query, 'like', ids),
        'like',
        cutoff,
        2,
      ),
    ).toBe(2)
    await query.commit()
    await cleanupRetainedIdentityRoots(1_000, { post: [postId] })
    expect(await hasTestRetainedIdentityRoot('post', postId)).toBe(false)
  })
})
