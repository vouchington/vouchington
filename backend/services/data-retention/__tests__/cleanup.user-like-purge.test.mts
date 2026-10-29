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
import { readTestPostCreator } from '@voucha/test-helpers/publication-test-queries'
import { DELETED_USER_ID } from '@services/users/constants'
import { recordLike } from '../../ap-post-likes/record-like.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('final user purge of posts with remote Likes', () => {
  it('reassigns every authored post before user deletion and preserves its active Like', async () => {
    const { postId, userId } = await withCommittedPostgresTransactionForTest(query =>
      insertOperationalLocalPostForTest(query),
    )
    const actor = await withCommittedPostgresTransactionForTest(query =>
      insertOperationalRemoteActorForTest(query, new Date()),
    )
    const activityId = `${actor.actorUri}/likes/active`
    await recordLike(postId, actor.id, activityId)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(userId, window.firstEligibleDate)

    let deleted = 0
    for (let page = 0; page < 16; page++) {
      const result = await cleanupSoftDeletedUser(userId, window.upperBoundDate, undefined, 1)
      deleted = result.deleted
      if (!result.hasMore) break
    }
    expect(deleted).toBe(1)
    expect(await getTestUserRaw(userId)).toBeNull()
    expect(await readTestPostCreator(postId)).toBe(DELETED_USER_ID)

    await using query = await beginTransaction()
    expect(await readOperationalLikeIdentityForTest(query, activityId)).toMatchObject({
      undone_at: null,
    })
    await cleanupRetainedIdentityRoots(1_000, { post: [postId] })
    expect(await hasTestRetainedIdentityRoot('post', postId)).toBe(true)
  })
})
