import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  followUser,
  hardDeleteTestUser,
} from '@voucha/test-helpers'
import { getFollowerDistributionCursorForTest } from '@voucha/test-helpers/sql-follower-distribution'
import { sharePostWithFollowers } from '../create.mts'
import { processFollowerDistributionChunk } from '../process.mts'

describe('follower distribution recipient cursor', () => {
  it('keeps its keyset position after the last processed recipient is deleted', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const followers = await Promise.all([createTestUser(), createTestUser()])
    const ordered = followers.toSorted((left, right) => left.id.localeCompare(right.id))
    for (const follower of ordered) await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    expect(
      await processFollowerDistributionChunk(distribution.distribution_id, { chunkSize: 1 }),
    ).toMatchObject({ processed: 1, completed: false })
    expect(await getFollowerDistributionCursorForTest(distribution.distribution_id)).toBe(
      ordered[0]!.id,
    )
    await hardDeleteTestUser(ordered[0]!.id)
    expect(await getFollowerDistributionCursorForTest(distribution.distribution_id)).toBe(
      ordered[0]!.id,
    )
    expect(
      await processFollowerDistributionChunk(distribution.distribution_id, { chunkSize: 2 }),
    ).toMatchObject({ processed: 1, completed: true })
    expect(await getFollowerDistributionCursorForTest(distribution.distribution_id)).toBe(
      ordered[1]!.id,
    )
  })
})
