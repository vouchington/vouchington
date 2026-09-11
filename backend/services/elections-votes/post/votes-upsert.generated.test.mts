import { expect, it, beforeAll, describe } from 'vitest'
import { createTestUser, insertTestPost, pollUntilNotNull } from '@voucha/test-helpers'
import { getPostElectionById } from './get-election.mts'
import { upsertPostElectionVotes } from './votes-upsert.mts'
import type { PrivateUser } from '@services/users/types'

describe('votes-upsert.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('full vote flow updates stats and refreshes cached election view', async () => {
    const postId = await insertTestPost({
      title: 'Post election full vote flow',
      slug: `post-election-vote-flow-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
      markdown: 'Post election full vote flow markdown',
    })

    const before = await getPostElectionById(postId)
    expect(before).toBeTruthy()
    expect(before?.votes_count_up).toBe(0)
    expect(before?.votes_count_down).toBe(0)

    await upsertPostElectionVotes(user.id, [{ entityId: postId, score: 1 }])

    const refreshed = await waitForUpdatedElectionStats(postId)
    expect(refreshed).toBeTruthy()
    expect(refreshed?.votes_count_up).toBe(1)
    expect(refreshed?.votes_count_down).toBe(0)
    expect(refreshed?.votes_score_net).toBe(1)
  })

  it('does not append a Clear for a user who has never voted', async () => {
    const postId = await insertTestPost({
      title: 'Post election first Clear',
      slug: `post-election-first-clear-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
      markdown: 'Post election first Clear markdown',
    })

    await expect(
      upsertPostElectionVotes(user.id, [{ entityId: postId, score: null }]),
    ).resolves.toEqual([])
  })

  async function waitForUpdatedElectionStats(postId: string) {
    const latest = await pollUntilNotNull(
      async () => {
        const latest = await getPostElectionById(postId)
        if (latest && latest.votes_count_up === 1 && latest.votes_count_down === 0) {
          return latest
        }
        return null
      },
      600,
      50,
    )

    if (latest === null) throw new Error(`Election stats did not converge in time: ${postId}`)
    return latest
  }
})
