import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getPersistedPostVoteStats,
  hardDeleteTestUser,
  hardDeleteTestUserWithLockTimeout,
  insertPostElectionVote,
  insertPostElectionVoteAndWaitBeforeCommit,
  insertTestPost,
  lockTestPostAndWaitBeforeCommit,
  setTestUserVoteWeight,
} from '@voucha/test-helpers'
import { POST_ELECTION_CONFIG } from '../post/config.mts'
import {
  aggregateElectionVoteStatsFromReplica,
  updateElectionStatsIfChanged,
} from './vote-aggregation.mts'

describe('vote stats snapshot ordering', () => {
  it('captures the aggregate statement snapshot around a held lower-ID vote', async () => {
    const { postId, voter } = await createPostAndVoter('held-vote')
    const suffix = randomBytes(6).toString('hex')
    const heldVoter = await createTestUserDirect({
      username: `test-vss-held-vote-second-${suffix}`,
    })
    await insertPostElectionVote(voter.id, postId, 1, '00000000-0000-7000-8000-000000000001')
    const inserted = Promise.withResolvers<void>()
    const releaseVote = Promise.withResolvers<void>()
    const holdingVote = insertPostElectionVoteAndWaitBeforeCommit({
      userId: heldVoter.id,
      postId,
      score: -1,
      id: '00000000-0000-7000-8000-000000000000',
      inserted: inserted.resolve,
      waitBeforeCommit: releaseVote.promise,
    })
    await inserted.promise

    try {
      const beforeCommit = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)
      expect(beforeCommit.votes_count_up).toBe(1)
      expect(beforeCommit.votes_count_down).toBe(0)
    } finally {
      releaseVote.resolve()
      await holdingVote
    }
    const afterCommit = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)
    expect(afterCommit.votes_count_up).toBe(1)
    expect(afterCommit.votes_count_down).toBe(1)
  }, 60_000)

  it('rejects an equal-xmax snapshot with more in-progress transactions', async () => {
    const { postId, voter } = await createPostAndVoter('equal-xmax')
    const heldVoter = await createTestUserDirect({
      username: `test-vss-equal-xmax-held-${randomBytes(6).toString('hex')}`,
    })
    await insertPostElectionVote(voter.id, postId, 1, '00000000-0000-7000-8000-000000000001')
    const inserted = Promise.withResolvers<void>()
    const releaseVote = Promise.withResolvers<void>()
    const holdingVote = insertPostElectionVoteAndWaitBeforeCommit({
      userId: heldVoter.id,
      postId,
      score: -1,
      id: '00000000-0000-7000-8000-000000000000',
      inserted: inserted.resolve,
      waitBeforeCommit: releaseVote.promise,
    })
    await inserted.promise
    let stale: Awaited<ReturnType<typeof aggregateElectionVoteStatsFromReplica>>
    let fresh: typeof stale
    try {
      // Complete a later transaction so the held XID falls below xmax and appears in xip.
      await setTestUserVoteWeight(voter.id, 1)
      stale = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)
      expect(stale.snapshot.xipCount).toBeGreaterThan(0)
      fresh = {
        ...stale,
        votes_count_down: 1,
        snapshot: { xmax: stale.snapshot.xmax, xipCount: stale.snapshot.xipCount - 1 },
      }
    } finally {
      releaseVote.resolve()
      await holdingVote
    }

    await expect(
      updateElectionStatsIfChanged(POST_ELECTION_CONFIG, postId, fresh),
    ).resolves.toBeDefined()
    await expect(
      updateElectionStatsIfChanged(POST_ELECTION_CONFIG, postId, stale),
    ).resolves.toBeUndefined()
    await expect(getPersistedPostVoteStats(postId)).resolves.toMatchObject({
      votes_count_up: fresh.votes_count_up,
      votes_snapshot_xmax: fresh.snapshot.xmax,
      votes_snapshot_xip_count: fresh.snapshot.xipCount,
    })
  }, 60_000)

  it('rejects a stale zero-vote snapshot after a vote lands', async () => {
    const { postId, voter } = await createPostAndVoter('stale-zero')
    const stale = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)
    await insertPostElectionVote(voter.id, postId, 1)
    const fresh = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)

    await updateElectionStatsIfChanged(POST_ELECTION_CONFIG, postId, fresh)
    await expect(
      updateElectionStatsIfChanged(POST_ELECTION_CONFIG, postId, stale),
    ).resolves.toBeUndefined()
    await expect(getPersistedPostVoteStats(postId)).resolves.toMatchObject({
      votes_count_up: 1,
      votes_snapshot_xmax: fresh.snapshot.xmax,
      votes_snapshot_xip_count: fresh.snapshot.xipCount,
    })
  }, 60_000)

  it('accepts voter weight and hard-deletion changes without another vote ID', async () => {
    const { postId, voter } = await createPostAndVoter('lifecycle')
    await insertPostElectionVote(voter.id, postId, 1)
    await updateElectionStatsIfChanged(
      POST_ELECTION_CONFIG,
      postId,
      await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId),
    )

    await setTestUserVoteWeight(voter.id, 2)
    const weighted = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)
    await expect(
      updateElectionStatsIfChanged(POST_ELECTION_CONFIG, postId, weighted),
    ).resolves.toBeDefined()
    expect(weighted.votes_score_up).toBe(4)

    await hardDeleteTestUser(voter.id)
    const deleted = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)
    await expect(
      updateElectionStatsIfChanged(POST_ELECTION_CONFIG, postId, deleted),
    ).resolves.toBeDefined()
    expect(deleted.votes_count_up).toBe(0)
  }, 60_000)

  it('does not block hard voter deletion on a held non-author post', async () => {
    const { postId, voter } = await createPostAndVoter('delete-lock')
    await insertPostElectionVote(voter.id, postId, 1)
    await updateElectionStatsIfChanged(
      POST_ELECTION_CONFIG,
      postId,
      await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId),
    )
    const locked = Promise.withResolvers<void>()
    const releasePost = Promise.withResolvers<void>()
    const holdingPost = lockTestPostAndWaitBeforeCommit(postId, locked.resolve, releasePost.promise)
    await locked.promise

    try {
      await expect(hardDeleteTestUserWithLockTimeout(voter.id)).resolves.toBeUndefined()
    } finally {
      releasePost.resolve()
    }
    await holdingPost
  }, 60_000)
})

async function createPostAndVoter(
  prefix: string,
): Promise<{ postId: string; voter: { id: string } }> {
  const suffix = randomBytes(6).toString('hex')
  const creator = await createTestUserDirect({
    username: `test-vss-${prefix}-creator-${suffix}`,
  })
  const voter = await createTestUserDirect({ username: `test-vss-${prefix}-voter-${suffix}` })
  const postId = await insertTestPost({
    title: `Vote stats ${prefix} ${suffix}`,
    slug: `vote-stats-${prefix}-${suffix}`,
    createdById: creator.id,
    markdown: 'test',
  })
  return { postId, voter }
}
