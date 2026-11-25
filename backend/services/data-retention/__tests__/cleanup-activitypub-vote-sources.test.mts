import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  beginTransaction,
  createTestUserDirect,
  getTestPostVoteIds,
  getTestPostVoteRetentionDeferredAt,
  getTestRetainedPostVoteCount,
  insertTestPost,
  insertTestPostVote,
  setTestPostVoteActivityPubSource,
  setTestPostVoteRetentionDeferredAt,
} from '@voucha/test-helpers'
import { commitTestPostgresHolderAfterActionOrWait } from '@voucha/test-helpers/postgres-lock-skip'
import { createExactRetentionWindow } from '@voucha/test-helpers/retention-window'
import { listPendingOutboundDistributionPage } from '../../activitypub-delivery/distribution-recovery.mts'
import { cleanupSupersededVoteBallots } from '../cleanup-vote-ballots.mts'
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

    const aged = (
      await cleanupSupersededVoteBallots(2, NOW, { post_votes: [supersederId] }, ['post_votes'])
    )[0]!
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

    const aged = (
      await cleanupSupersededVoteBallots(2, NOW, { post_votes: [supersederId] }, ['post_votes'])
    )[0]!
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
    await cleanupSupersededVoteBallots(2, NOW, { post_votes: [supersederId] }, ['post_votes'])

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

  it('counts only the deleted ballot when another page releases the current ballot', async () => {
    const { userId, postId } = await postForTest()
    const { aged } = createExactRetentionWindow(90)
    const day = aged.toISOString().slice(0, 10)
    const sourceTime = Date.parse(day)
    const older = uuidv7({ msecs: sourceTime })
    const current = uuidv7({ msecs: sourceTime + 1 })
    for (const id of [older, current]) {
      await insertTestPostVote(postId, userId, '127.0.0.1', 1, id)
      await setTestPostVoteActivityPubSource(postId, id, id, null, NOW)
      await setTestPostVoteRetentionDeferredAt(postId, id, NOW)
    }
    const before = await getTestRetainedPostVoteCount(day)

    await using winner = await beginTransaction()
    expect(
      await cleanupDeferredPostVoteBallots(1, NOW, {
        query: winner,
        voteIds: [current],
      }),
    ).toMatchObject({ scanned: 1, deleted: 0 })
    const overlapping = await commitTestPostgresHolderAfterActionOrWait(
      winner,
      'cleanupDeferredPostVotePage',
      () => cleanupDeferredPostVoteBallots(2, NOW, { voteIds: [older, current] }),
    )

    expect(overlapping).toEqual({ scanned: 1, deleted: 1, hasMore: false })
    expect(await getTestPostVoteIds(postId, userId)).toEqual([current])
    expect(await getTestPostVoteRetentionDeferredAt(postId, current)).toBeNull()
    expect(await getTestRetainedPostVoteCount(day)).toBe(before + 1)
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
    expect(firstPage).toMatchObject({ scanned: 1, deleted: 1, hasMore: true })
    expect(await cleanupDeferredPostVoteBallots(1, futureNow, { voteIds: [firstId] })).toEqual({
      scanned: 0,
      deleted: 0,
      hasMore: false,
    })
    expect(await getTestPostVoteIds(second.postId, second.userId)).toEqual([secondId, newerId])
    await cleanupDeferredPostVoteBallots(1, futureNow, { voteIds: [secondId] })
  })
})
