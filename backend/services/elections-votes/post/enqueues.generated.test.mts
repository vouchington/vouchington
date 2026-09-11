import { expect, it, beforeAll, describe } from 'vitest'
import { createTestUser, insertPostElectionVote, insertTestPost } from '@voucha/test-helpers'
import { getPostElectionById } from './get-election.mts'
import { enqueueBulkUpdatePostElectionVoteStats } from '@queues/elections/enqueues'
import type { PrivateUser } from '@services/users/types'

describe('enqueues.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('enqueueBulkUpdatePostElectionVoteStats executes inline and updates vote stats', async () => {
    const postId = await insertTestPost({
      title: 'Post election inline cache invalidation',
      slug: `post-election-inline-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
      markdown: 'Post election inline invalidation markdown',
    })

    await insertPostElectionVote(user.id, postId, 1, undefined, false, true)

    const before = await getPostElectionById(postId)
    expect(before).toBeTruthy()

    await enqueueBulkUpdatePostElectionVoteStats([postId])

    const refreshed = await getPostElectionById(postId)
    expect(refreshed).toBeTruthy()
    expect(refreshed?.votes_count_up).toBe(1)
    expect(refreshed?.votes_score_net).toBe(1)
  })
})
