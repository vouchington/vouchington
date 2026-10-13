import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getFollowedUsersByElectionVote } from './follow-context.mts'

describe('getFollowedUsersByElectionVote', () => {
  it('returns empty context for a missing entity ID', async () => {
    const viewer = await createTestUser()

    await expect(getFollowedUsersByElectionVote(viewer, null, 'post_votes', 1)).resolves.toEqual({
      total: 0,
      users: [],
    })
  })

  it('rejects an unexpected vote table before querying', async () => {
    const viewer = await createTestUser()

    await expect(
      getFollowedUsersByElectionVote(viewer, viewer.id, 'invalid_votes' as 'post_votes', 1),
    ).rejects.toThrow('Invalid vote table: invalid_votes')
  })
})
