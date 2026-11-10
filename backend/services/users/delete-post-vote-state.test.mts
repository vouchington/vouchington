import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, insertTestPostVote } from '@voucha/test-helpers'
import { hasTestUserDeletionResidual } from '@voucha/test-helpers/entities/oauth-deletion'
import {
  countOwnedPostVoteStatesForTest,
  removeOwnedPostVoteHistoryForTest,
} from '@voucha/test-helpers/user-deletion-post-vote-state'
import { drainUserDeletionForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { deleteUser } from './delete.mts'
import { processUserDeletionPhaseBatch } from './delete-phases.mts'

describe('user deletion current post ballots', () => {
  it('blocks completion for an orphaned current ballot and erases it in the bounded vote phase', async () => {
    const author = await createTestUser()
    const voter = await createTestUser({ withEmail: false })
    const post = await createTestPost({ user: author })
    await insertTestPostVote(post.id, voter.id, '127.0.0.1', 1)
    await removeOwnedPostVoteHistoryForTest(voter.id, post.id)
    const attempt = await deleteUser(voter, voter)
    expect(await countOwnedPostVoteStatesForTest(voter.id, post.id)).toBe(1)
    expect(await hasTestUserDeletionResidual(voter.id)).toBe(true)
    const result = await processUserDeletionPhaseBatch({
      requestId: attempt.requestId,
      processingAttemptId: attempt.processingAttemptId,
      userId: voter.id,
      phase: 'votes',
      batchSize: 1,
    })
    expect(result.hasMore).toBe(true)
    expect(await countOwnedPostVoteStatesForTest(voter.id, post.id)).toBe(0)
    expect(await hasTestUserDeletionResidual(voter.id)).toBe(false)
    await drainUserDeletionForTest(attempt)
  })
})
