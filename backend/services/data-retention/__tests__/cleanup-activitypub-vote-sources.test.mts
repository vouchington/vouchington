import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUserDirect,
  getTestPostVoteIds,
  getTestPostVoteRetentionDeferredAt,
  insertTestPost,
  insertTestPostVote,
  setTestPostVoteActivityPubSource,
  setTestPostVoteRetentionDeferredAt,
} from '@voucha/test-helpers'
import { listPendingOutboundDistributionPage } from '../../activitypub-delivery/distribution-recovery.mts'
import { cleanupSupersededVoteBallotTable } from '../cleanup-vote-ballots.mts'
import { cleanupDeferredPostVoteBallots } from '../cleanup-deferred-post-votes.mts'

const NOW = new Date('2026-10-23T12:00:00.000Z')

async function postForTest() {
  const user = await createTestUserDirect()
  if (!user) throw new Error('Failed to create test user')
  const postId = await insertTestPost({
    createdById: user.id,
    title: 'ActivityPub vote retention test',
    slug: `ap-vote-retention-${randomUUID()}`,
    markdown: 'test',
  })
  return { userId: user.id, postId }
}

describe('ActivityPub ballot source retention', () => {
  it('keeps a pending Like source recoverable until the maximum replay horizon, then deletes it', async () => {
    const { userId, postId } = await postForTest()
    const sourceId = uuidv7({ msecs: Date.parse('2026-01-01T00:00:00.000Z') })
    const supersederId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00.000Z') })
    await insertTestPostVote(postId, userId, '127.0.0.1', 1, sourceId)
    await insertTestPostVote(postId, userId, '127.0.0.1', 2, supersederId)
    await setTestPostVoteActivityPubSource(postId, sourceId, sourceId)
    await setTestPostVoteActivityPubSource(postId, supersederId, sourceId)

    const aged = await cleanupSupersededVoteBallotTable('post_votes', 2, NOW, [supersederId])
    expect(aged.deleted).toBe(0)
    expect(await getTestPostVoteIds(postId, userId)).toEqual([sourceId, supersederId])
    expect(await getTestPostVoteRetentionDeferredAt(postId, sourceId)).not.toBeNull()
    const recovery = await listPendingOutboundDistributionPage(
      'votes',
      `${postId}__00000000-0000-7000-8000-000000000000`,
      1,
      postId,
    )
    expect(recovery.rows).toContainEqual(
      expect.objectContaining({ source: 'votes', targetPostId: postId, activityId: sourceId }),
    )

    const expired = await cleanupDeferredPostVoteBallots(1, new Date('2027-01-04T00:00:00.000Z'), {
      voteIds: [sourceId],
    })
    expect(expired.deleted).toBe(1)
    expect(await getTestPostVoteIds(postId, userId)).toEqual([supersederId])
  })

  it('deletes a delivered Like source on the ordinary 90-day ballot path', async () => {
    const { userId, postId } = await postForTest()
    const sourceId = uuidv7({ msecs: Date.parse('2026-01-01T00:00:00.000Z') })
    const supersederId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00.000Z') })
    await insertTestPostVote(postId, userId, '127.0.0.1', 1, sourceId)
    await insertTestPostVote(postId, userId, '127.0.0.1', 2, supersederId)
    await setTestPostVoteActivityPubSource(postId, sourceId, sourceId, null, NOW)
    await setTestPostVoteActivityPubSource(postId, supersederId, sourceId)

    const aged = await cleanupSupersededVoteBallotTable('post_votes', 2, NOW, [supersederId])
    expect(aged.deleted).toBe(1)
    expect(await getTestPostVoteIds(postId, userId)).toEqual([supersederId])
  })

  it('releases a deferred source when ActivityPub delivery finishes before the replay horizon', async () => {
    const { userId, postId } = await postForTest()
    const sourceId = uuidv7({ msecs: Date.parse('2026-01-01T00:00:00.000Z') })
    const supersederId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00.000Z') })
    await insertTestPostVote(postId, userId, '127.0.0.1', 1, sourceId)
    await insertTestPostVote(postId, userId, '127.0.0.1', 2, supersederId)
    await setTestPostVoteActivityPubSource(postId, sourceId, sourceId)
    await setTestPostVoteActivityPubSource(postId, supersederId, sourceId)
    await cleanupSupersededVoteBallotTable('post_votes', 2, NOW, [supersederId])

    await setTestPostVoteActivityPubSource(postId, sourceId, sourceId, null, NOW)
    const delivered = await cleanupDeferredPostVoteBallots(1, NOW, { voteIds: [sourceId] })
    expect(delivered.deleted).toBe(1)
    expect(await getTestPostVoteIds(postId, userId)).toEqual([supersederId])
  })

  it('keeps a now-current ballot and removes its deferred marker from the due index', async () => {
    const { userId, postId } = await postForTest()
    const voteId = uuidv7({ msecs: Date.parse('2024-01-01T00:00:00.000Z') })
    await insertTestPostVote(postId, userId, '127.0.0.1', 1, voteId)
    await setTestPostVoteActivityPubSource(postId, voteId, voteId)
    await setTestPostVoteRetentionDeferredAt(postId, voteId, NOW)

    await cleanupDeferredPostVoteBallots(1, NOW, { voteIds: [voteId] })
    expect(await getTestPostVoteIds(postId, userId)).toEqual([voteId])
    expect(await getTestPostVoteRetentionDeferredAt(postId, voteId)).toBeNull()
  })

  it('limits a due-source cleanup to its owned vote ID', async () => {
    const first = await postForTest()
    const second = await postForTest()
    const firstId = uuidv7({ msecs: Date.parse('2028-01-01T00:00:00.000Z') })
    const secondId = uuidv7({ msecs: Date.parse('2028-01-02T00:00:00.000Z') })
    const newerId = uuidv7({ msecs: Date.parse('2029-01-01T00:00:00.000Z') })
    for (const [fixture, sourceId] of [
      [first, firstId],
      [second, secondId],
    ] as const) {
      await insertTestPostVote(fixture.postId, fixture.userId, '127.0.0.1', 1, sourceId)
      await insertTestPostVote(fixture.postId, fixture.userId, '127.0.0.1', 2, newerId)
      await setTestPostVoteRetentionDeferredAt(fixture.postId, sourceId, NOW)
    }
    const futureNow = new Date('2030-10-23T12:00:00.000Z')
    await expect(
      cleanupDeferredPostVoteBallots(1, futureNow, { voteIds: [firstId, secondId] }),
    ).rejects.toThrow('Scoped deferred post ballots must fit one page')

    const firstPage = await cleanupDeferredPostVoteBallots(1, futureNow, { voteIds: [firstId] })
    expect(firstPage).toMatchObject({ scanned: 1, deleted: 1, hasMore: false })
    expect(await getTestPostVoteIds(second.postId, second.userId)).toEqual([secondId, newerId])
    await cleanupDeferredPostVoteBallots(1, futureNow, { voteIds: [secondId] })
  })
})
