import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'
import { softDeleteUserFollowRelations } from '@services/entity-relations/soft-delete-user-follows'
import { upsertPostElectionVotes } from '@services/elections-votes/post/votes-upsert'
import { getUndoFollowActivityId } from '@queues/activitypub/enqueues/delivery'
import { listPendingOutboundDistributionPage } from './distribution-recovery.mts'
import { markActivityDistributionComplete } from './distribution-progress.mts'

const FIRST_ID = '00000000-0000-0000-0000-000000000000'
const FOLLOW_RELATION = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'follow',
  objectType: 'user',
})

describe('outbound ActivityPub recovery source', () => {
  it('recovers the current Follow and Undo generation, then converges after each final page', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    await upsertEntityRelation(null, FOLLOW_RELATION, { id: source.id }, [{ id: target.id }])
    const after = `${source.id}__${FIRST_ID}`
    const followPage = await listPendingOutboundDistributionPage('follows', after, 1)
    expect(followPage.rows).toHaveLength(1)
    const follow = followPage.rows[0]
    if (!follow || follow.source !== 'follows') throw new Error('Expected a Follow source row')
    expect(follow).toMatchObject({
      sourceUserId: source.id,
      targetUserId: target.id,
      deleted: false,
    })
    await markActivityDistributionComplete({
      activityType: 'Follow',
      activityId: follow.originalFollowActivityId,
      sourceUserId: source.id,
      targetUserId: target.id,
    })
    expect(
      (await listPendingOutboundDistributionPage('follows', after, 1)).rows.some(
        row =>
          row.source === 'follows' &&
          row.sourceUserId === source.id &&
          row.targetUserId === target.id,
      ),
    ).toBe(false)

    const [deleted] = await softDeleteUserFollowRelations(source.id, [target.id])
    expect(deleted?.activityPubUndoIdentity?.undoActivityId).toBe(
      getUndoFollowActivityId(follow.originalFollowActivityId),
    )
    const undoPage = await listPendingOutboundDistributionPage('follows', after, 1)
    expect(undoPage.rows[0]).toMatchObject({
      deleted: true,
      originalFollowActivityId: follow.originalFollowActivityId,
    })
    await markActivityDistributionComplete({
      activityType: 'UndoFollow',
      activityId: getUndoFollowActivityId(follow.originalFollowActivityId),
      originalActivityId: follow.originalFollowActivityId,
      sourceUserId: source.id,
      targetUserId: target.id,
    })
    expect(
      (await listPendingOutboundDistributionPage('follows', after, 1)).rows.some(
        row =>
          row.source === 'follows' &&
          row.sourceUserId === source.id &&
          row.targetUserId === target.id,
      ),
    ).toBe(false)
  })

  it('recovers Like and UndoLike ballot events with their exact original identity', async () => {
    const voter = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: voter.id,
      title: 'Outbound recovery ballot',
      slug: `outbound-recovery-${randomUUID()}`,
      markdown: 'A public post for ballot recovery',
    })
    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 1 }])
    const after = `${postId}__${FIRST_ID}`
    const likePage = await listPendingOutboundDistributionPage('votes', after, 1)
    expect(likePage.rows).toHaveLength(1)
    const like = likePage.rows[0]
    if (!like || like.source !== 'votes') throw new Error('Expected a Like ballot event')
    expect(like.targetPostId).toBe(postId)
    expect(like.originalLikeActivityId).toBeNull()
    await markActivityDistributionComplete({
      activityType: 'Like',
      activityId: like.activityId,
      sourceUserId: voter.id,
      targetPostId: postId,
    })
    expect(
      (await listPendingOutboundDistributionPage('votes', after, 1)).rows.some(
        row => row.source === 'votes' && row.targetPostId === postId,
      ),
    ).toBe(false)

    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 0 }])
    const undoPage = await listPendingOutboundDistributionPage('votes', after, 1)
    const undo = undoPage.rows[0]
    if (!undo || undo.source !== 'votes') throw new Error('Expected an UndoLike ballot event')
    expect(undo.originalLikeActivityId).toBe(like.activityId)
    await markActivityDistributionComplete({
      activityType: 'UndoLike',
      activityId: undo.activityId,
      sourceUserId: voter.id,
      targetPostId: postId,
    })
    expect(
      (await listPendingOutboundDistributionPage('votes', after, 1)).rows.some(
        row => row.source === 'votes' && row.targetPostId === postId,
      ),
    ).toBe(false)
  })

  it('retains the canonical Like after a positive-strength change', async () => {
    const voter = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: voter.id,
      title: 'Outbound recovery Like strength',
      slug: `outbound-recovery-strength-${randomUUID()}`,
      markdown: 'A public post with a positive-strength change',
    })
    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 1 }])
    const after = `${postId}__${FIRST_ID}`
    const firstPage = await listPendingOutboundDistributionPage('votes', after, 10)
    const firstLike = firstPage.rows.find(row => row.source === 'votes')
    if (!firstLike || firstLike.source !== 'votes') throw new Error('Expected first Like')

    // Positive score changes append a ballot row but keep the original Like identity.
    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 2 }])

    const pendingPage = await listPendingOutboundDistributionPage('votes', after, 10)
    expect(pendingPage.rows).toHaveLength(1)
    expect(pendingPage.rows[0]).toMatchObject({
      source: 'votes',
      sourceUserId: voter.id,
      targetPostId: postId,
      activityId: firstLike.activityId,
      originalLikeActivityId: null,
    })
    await markActivityDistributionComplete({
      activityType: 'Like',
      activityId: firstLike.activityId,
      sourceUserId: voter.id,
      targetPostId: postId,
    })
    expect((await listPendingOutboundDistributionPage('votes', after, 10)).rows).toEqual([])
  })

  it('skips an obsolete Like after a clear and resumes at a replacement Like', async () => {
    const voter = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: voter.id,
      title: 'Outbound recovery replaced ballot',
      slug: `outbound-recovery-replaced-${randomUUID()}`,
      markdown: 'A public post for replaced ballot recovery',
    })
    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 1 }])
    const before = `${postId}__${FIRST_ID}`
    const firstLikePage = await listPendingOutboundDistributionPage('votes', before, 10)
    const firstLike = firstLikePage.rows.find(row => row.source === 'votes')
    if (!firstLike || firstLike.source !== 'votes') throw new Error('Expected first Like')

    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 0 }])
    const undoPage = await listPendingOutboundDistributionPage('votes', before, 10)
    const undo = undoPage.rows.find(row => row.source === 'votes')
    if (!undo || undo.source !== 'votes') throw new Error('Expected UndoLike')
    expect(undo.originalLikeActivityId).toBe(firstLike.activityId)
    await markActivityDistributionComplete({
      activityType: 'UndoLike',
      activityId: undo.activityId,
      sourceUserId: voter.id,
      targetPostId: postId,
    })

    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 1 }])
    const obsoletePage = await listPendingOutboundDistributionPage('votes', before, 1)
    expect(obsoletePage.rows).toEqual([])
    expect(obsoletePage.next).toBe(firstLike.cursor)

    const replacementPage = await listPendingOutboundDistributionPage(
      'votes',
      obsoletePage.next,
      1,
      obsoletePage.throughPostId,
    )
    expect(replacementPage.rows).toHaveLength(1)
    const replacement = replacementPage.rows[0]
    if (!replacement || replacement.source !== 'votes') throw new Error('Expected replacement Like')
    expect(replacement).toMatchObject({
      source: 'votes',
      sourceUserId: voter.id,
      targetPostId: postId,
      originalLikeActivityId: null,
    })
    expect(replacement.activityId).not.toBe(firstLike.activityId)
  })

  it('skips an idle post window and pages pending ballots directly by post and vote id', async () => {
    const voter = await createTestUserDirect()
    const secondVoter = await createTestUserDirect()
    const emptyPostId = await insertTestPost({
      createdById: voter.id,
      title: 'Outbound recovery empty parent',
      slug: `outbound-recovery-empty-${randomUUID()}`,
      markdown: 'No pending votes',
    })
    const votedPostId = await insertTestPost({
      createdById: voter.id,
      title: 'Outbound recovery busy parent',
      slug: `outbound-recovery-busy-${randomUUID()}`,
      markdown: 'Two pending votes',
    })
    await upsertPostElectionVotes(voter.id, [{ entityId: votedPostId, score: 1 }])
    await upsertPostElectionVotes(secondVoter.id, [{ entityId: votedPostId, score: 1 }])

    const emptyPage = await listPendingOutboundDistributionPage(
      'votes',
      `${emptyPostId}__${FIRST_ID}`,
      1,
      emptyPostId,
    )
    expect(emptyPage.rows).toEqual([])
    expect(emptyPage.next).toBeUndefined()
    expect(emptyPage.throughPostId).toBe(emptyPostId)

    const firstVotePage = await listPendingOutboundDistributionPage(
      'votes',
      `${emptyPostId}__${FIRST_ID}`,
      1,
    )
    expect(firstVotePage.rows).toHaveLength(1)
    const firstVote = firstVotePage.rows[0]
    if (!firstVote || firstVote.source !== 'votes') throw new Error('Expected first vote')
    expect(firstVote).toMatchObject({ targetPostId: votedPostId })
    expect(firstVotePage.next).toBe(firstVote.cursor)
    expect(firstVotePage.throughPostId).toBeDefined()

    const secondVotePage = await listPendingOutboundDistributionPage(
      'votes',
      firstVotePage.next,
      1,
      firstVotePage.throughPostId,
    )
    expect(secondVotePage.rows).toHaveLength(1)
    const secondVote = secondVotePage.rows[0]
    if (!secondVote || secondVote.source !== 'votes') throw new Error('Expected second vote')
    expect(secondVote).toMatchObject({ targetPostId: votedPostId })
    expect(secondVote.activityId).not.toBe(firstVote.activityId)
  })
})
