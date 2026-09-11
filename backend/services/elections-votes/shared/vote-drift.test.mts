import { describe, expect, it, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  isTestPostVoteFixtureVisibleFromReplica,
  insertPostElectionVote,
  insertTestPost,
  insertTestPostVote,
  setPostElectionUpvoteStats,
} from '@voucha/test-helpers'
import { reconcilePostVoteDrift } from './vote-drift.mts'
import type { PrivateUser } from '@services/users/types'

describe('reconcilePostVoteDrift', () => {
  let creatorUser: PrivateUser

  beforeAll(async () => {
    creatorUser = await createTestUserDirect({
      username: `test-vd-${randomBytes(4).toString('hex')}`,
    })
  }, 60_000)

  it('returns a vote-drift result for the posts table without throwing', async () => {
    const postId = await insertTestPost({
      title: 'Vote drift reconciliation',
      slug: `vote-drift-${randomBytes(6).toString('hex')}`,
      createdById: creatorUser.id,
      markdown: 'test',
    })
    const upvoter = await createTestUserDirect({
      username: `test-vd-up-${randomBytes(4).toString('hex')}`,
    })
    const downvoter = await createTestUserDirect({
      username: `test-vd-dn-${randomBytes(4).toString('hex')}`,
    })
    await insertTestPostVote(postId, upvoter.id, '1.2.3.4', 1)
    await insertTestPostVote(postId, downvoter.id, '1.2.3.5', -1)

    const result = await reconcilePostVoteDrift(50)

    expect(result.entityTable).toBe('posts')
    expect(typeof result.sampled).toBe('number')
    expect(result.sampled).toBeGreaterThanOrEqual(1)
    expect(typeof result.drifted).toBe('number')
    expect(result.drifted).toBeGreaterThanOrEqual(0)
    expect(result.drifted).toBeLessThanOrEqual(result.sampled)
    expect(['string', 'undefined']).toContain(typeof result.sampleEntityId)
  }, 60_000)

  it('flags drift when a stored counter is out of sync with its votes', async () => {
    const postId = await insertTestPost({
      title: 'Vote drift detected',
      slug: `vote-drift-hit-${randomBytes(6).toString('hex')}`,
      createdById: creatorUser.id,
      markdown: 'test',
    })
    const voter = await createTestUserDirect({
      username: `test-vd-hit-${randomBytes(4).toString('hex')}`,
    })
    // A vote exists in post_votes but posts.votes_count_* was never synced (the async
    // election-stats job does not run in tests), so the post is genuinely drifted.
    await insertTestPostVote(postId, voter.id, '1.2.3.6', 1)

    await expect
      .poll(
        () =>
          isTestPostVoteFixtureVisibleFromReplica({
            postId,
            voterId: voter.id,
            voteScore: 1,
            votesScoreUp: 0,
            votesCountUp: 0,
          }),
        { timeout: 10_000, interval: 100 },
      )
      .toBe(true)

    const result = await reconcilePostVoteDrift(1, { samplePostIds: [postId] })

    expect(result).toMatchObject({ sampleEntityId: postId, drifted: 1 })
  }, 60_000)

  it('does not count a legacy Clear zero ballot as Neutral drift', async () => {
    const postId = await insertTestPost({
      title: 'Legacy clear vote drift',
      slug: `vote-drift-legacy-clear-${randomBytes(6).toString('hex')}`,
      createdById: creatorUser.id,
      markdown: 'test',
    })
    const voter = await createTestUserDirect({
      username: `test-vd-legacy-clear-${randomBytes(4).toString('hex')}`,
    })
    await insertPostElectionVote(voter.id, postId, 0)

    await expect
      .poll(
        () =>
          isTestPostVoteFixtureVisibleFromReplica({
            postId,
            voterId: voter.id,
            voteScore: 0,
            votesScoreUp: 0,
            votesCountUp: 0,
          }),
        { timeout: 10_000, interval: 100 },
      )
      .toBe(true)

    const result = await reconcilePostVoteDrift(1, { samplePostIds: [postId] })

    expect(result).toMatchObject({ sampled: 1, drifted: 0 })
  }, 60_000)

  it('detects a historic Vouch stored at Like strength', async () => {
    const postId = await insertTestPost({
      title: 'Historic Vouch vote drift',
      slug: `vote-drift-historic-vouch-${randomBytes(6).toString('hex')}`,
      createdById: creatorUser.id,
      markdown: 'test',
    })
    const voter = await createTestUserDirect({
      username: `test-vd-historic-vouch-${randomBytes(4).toString('hex')}`,
    })
    await insertPostElectionVote(voter.id, postId, 1)
    await setPostElectionUpvoteStats(postId, 1, 1)

    await expect
      .poll(
        () =>
          isTestPostVoteFixtureVisibleFromReplica({
            postId,
            voterId: voter.id,
            voteScore: 1,
            votesScoreUp: 1,
            votesCountUp: 1,
          }),
        { timeout: 10_000, interval: 100 },
      )
      .toBe(true)

    await expect(reconcilePostVoteDrift(1, { samplePostIds: [postId] })).resolves.toMatchObject({
      sampleEntityId: postId,
      drifted: 1,
    })
  }, 60_000)

  it('ignores insignificant floating-point score differences', async () => {
    const postId = await insertTestPost({
      title: 'Vote drift floating-point tolerance',
      slug: `vote-drift-tolerance-${randomBytes(6).toString('hex')}`,
      createdById: creatorUser.id,
      markdown: 'test',
    })
    const voter = await createTestUserDirect({
      username: `test-vd-tolerance-${randomBytes(4).toString('hex')}`,
    })
    await insertPostElectionVote(voter.id, postId, 1)
    await setPostElectionUpvoteStats(postId, 2.0005, 1)

    await expect
      .poll(
        () =>
          isTestPostVoteFixtureVisibleFromReplica({
            postId,
            voterId: voter.id,
            voteScore: 1,
            votesScoreUp: 2.0005,
            votesCountUp: 1,
          }),
        { timeout: 10_000, interval: 100 },
      )
      .toBe(true)

    await expect(reconcilePostVoteDrift(1, { samplePostIds: [postId] })).resolves.toMatchObject({
      sampled: 1,
      drifted: 0,
    })
  }, 60_000)
})
