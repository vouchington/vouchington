import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  insertPostElectionVote,
} from '@voucha/test-helpers'
import { updatePostElectionVoteStats } from './vote-stats.mts'

describe('post election publication capture', () => {
  it('captures only vote-score transitions across public eligibility', async () => {
    const firstVoter = await createTestUser({ administrator: true })
    const secondVoter = await createTestUser({ administrator: true })
    const post = await createTestPost()

    await insertPostElectionVote(firstVoter.id, post.id, 1)
    await updatePostElectionVoteStats(post.id)
    const entered = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(entered).toBeDefined()

    await insertPostElectionVote(secondVoter.id, post.id, 1)
    await updatePostElectionVoteStats(post.id)
    const nonBoundary = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(nonBoundary!.generation).toBe(entered!.generation)

    await insertPostElectionVote(firstVoter.id, post.id, 0)
    await updatePostElectionVoteStats(post.id)
    await insertPostElectionVote(secondVoter.id, post.id, 0)
    await updatePostElectionVoteStats(post.id)
    const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(exited!.generation)).toBeGreaterThan(Number(entered!.generation))
  })
})
