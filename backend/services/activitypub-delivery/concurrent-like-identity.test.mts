import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUserDirect } from '@voucha/test-helpers'
import { writePostVotesConcurrently } from '@voucha/test-helpers/concurrent-post-vote-writes'
import { distributionPageJobId, getUndoLikeActivityId } from '@queues/activitypub/enqueues/delivery'
import { listPendingOutboundDistributionPage } from './distribution-recovery.mts'
import { markActivityDistributionComplete } from './distribution-progress.mts'
import { upsertPostElectionVotes } from '@services/elections-votes/post/votes-upsert'

const FIRST_ID = '00000000-0000-0000-0000-000000000000'
const LIKE = 1
const DISLIKE = -1
const CLEAR = 0

async function pendingRows(postId: string) {
  const page = await listPendingOutboundDistributionPage(
    'votes',
    `${postId}__${FIRST_ID}`,
    10,
    postId,
  )
  return page.rows.flatMap(row => (row.source === 'votes' ? [row] : []))
}

describe('concurrent post Like and Undo identity', () => {
  it('emits one Like generation for concurrent non-Like to Like requests', async () => {
    const voter = await createTestUserDirect()
    const post = await createTestPost({ user: voter })
    await upsertPostElectionVotes(voter.id, [{ entityId: post.id, score: DISLIKE }])

    const { rows, siblingRows } = await writePostVotesConcurrently(voter.id, post.id, LIKE, LIKE)

    const likeId = rows[0]?.outbound_activitypub_like_activity_id
    expect(likeId).toBeTruthy()
    expect(siblingRows[0]?.outbound_activitypub_like_activity_id).toBe(likeId)
    const pending = await pendingRows(post.id)
    expect(pending).toHaveLength(2)
    expect(new Set(pending.map(row => row.eventId)).size).toBe(2)
    expect(new Set(pending.map(row => row.activityId))).toEqual(new Set([likeId]))
    expect(
      new Set(pending.map(row => distributionPageJobId({ activityId: row.activityId }))).size,
    ).toBe(1)

    await markActivityDistributionComplete({
      activityType: 'Like',
      activityId: likeId!,
      sourceUserId: voter.id,
      targetPostId: post.id,
    })
    expect(await pendingRows(post.id)).toEqual([])
  })

  it('emits one Undo for concurrent Like to non-Like requests', async () => {
    const voter = await createTestUserDirect()
    const post = await createTestPost({ user: voter })
    const [liked] = await upsertPostElectionVotes(voter.id, [{ entityId: post.id, score: LIKE }])
    const likeId = liked!.outbound_activitypub_like_activity_id!

    const { rows, siblingRows } = await writePostVotesConcurrently(
      voter.id,
      post.id,
      DISLIKE,
      CLEAR,
    )

    expect(rows[0]?.previous_outbound_ap_like_activity_id).toBe(likeId)
    expect(siblingRows[0]?.previous_outbound_ap_like_activity_id).toBe(likeId)
    const undos = (await pendingRows(post.id)).filter(row => row.originalLikeActivityId)
    expect(undos).toHaveLength(2)
    expect(new Set(undos.map(row => row.activityId))).toEqual(
      new Set([getUndoLikeActivityId(likeId)]),
    )
    expect(
      new Set(undos.map(row => distributionPageJobId({ activityId: row.activityId }))).size,
    ).toBe(1)

    await markActivityDistributionComplete({
      activityType: 'UndoLike',
      activityId: getUndoLikeActivityId(likeId),
      originalActivityId: likeId,
      sourceUserId: voter.id,
      targetPostId: post.id,
    })
    expect((await pendingRows(post.id)).filter(row => row.originalLikeActivityId)).toEqual([])
  })

  it('finds the Like an Undo cancels after a strength change', async () => {
    const voter = await createTestUserDirect()
    const post = await createTestPost({ user: voter })
    const [liked] = await upsertPostElectionVotes(voter.id, [{ entityId: post.id, score: LIKE }])
    const [stronger] = await upsertPostElectionVotes(voter.id, [{ entityId: post.id, score: 2 }])
    expect(stronger?.outbound_activitypub_like_activity_id).toBeNull()
    const [undone] = await upsertPostElectionVotes(voter.id, [{ entityId: post.id, score: CLEAR }])
    expect(undone?.previous_outbound_ap_like_activity_id).toBe(
      liked!.outbound_activitypub_like_activity_id,
    )
  })
})
