import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  countTestUserDeletionPostVotes,
  createTestUser,
  hardDeleteTestPost,
  insertTestPost,
  insertTestUserDeletionPostVotes,
  withTestDeletionCandidateCascade,
} from '@voucha/test-helpers'
import { deleteOwnedRows } from './delete-phase-transaction.mts'

describe('deleteOwnedRows candidate cascade', () => {
  it('requires a recheck when a selected post vote cascades away before its delete', async () => {
    const creator = await createTestUser()
    const deletingVoter = await createTestUser()
    const firstPostId = await insertTestPost({
      title: `Owned vote cascade first ${v7()}`,
      slug: `owned-vote-cascade-first-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const secondPostId = await insertTestPost({
      title: `Owned vote cascade second ${v7()}`,
      slug: `owned-vote-cascade-second-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    await insertTestUserDeletionPostVotes(deletingVoter.id, firstPostId, 1)
    await insertTestUserDeletionPostVotes(deletingVoter.id, secondPostId, 1)

    const cascadedPage = await withTestDeletionCandidateCascade(
      'processUserDeletionOwnedRows:candidates',
      () => hardDeleteTestPost(firstPostId),
      async query =>
        deleteOwnedRows(
          query,
          'post_votes',
          new Set(['post_votes']),
          'user_id',
          'post_id',
          new Set(['post_id']),
          deletingVoter.id,
          1,
        ),
    )

    expect(cascadedPage).toBe(1)
    await expect(countTestUserDeletionPostVotes(deletingVoter.id)).resolves.toBe(1)
  })
})
