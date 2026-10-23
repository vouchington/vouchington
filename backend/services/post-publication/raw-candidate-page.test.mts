import { beginTransaction } from '@data-stores/psql'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  claimPostPublicationDirtyWork,
  updatePostPublicationDirtyWorkCursors,
} from './dirty-work.mts'
import { recordPostPublicationChange } from './capture.mts'
import { readRawPublicationCandidatePage } from './raw-candidate-page.mts'
import { readPublicationAncestorRootHints } from './candidate-root-hints.mts'
import { testPublicationWorkAtPost } from '@voucha/test-helpers/post-publication-fixtures'

describe('bounded publication ancestry', () => {
  it('skips unrelated roots while retaining a nonroot impacted post in another tree', async () => {
    const user = await createTestUser()
    const targetRoot = await createTestPost({ user })
    const impactedRoot = await createTestPost({ user })
    const impactedPost = await createTestPost({
      user,
      parent_post_id: impactedRoot.id,
      post_type: 'comment',
    })
    const impactedDescendant = await createTestPost({
      user,
      parent_post_id: impactedPost.id,
      post_type: 'comment',
    })
    const unrelatedRoot = await createTestPost({ user })
    const unrelatedComment = await createTestPost({
      user,
      parent_post_id: unrelatedRoot.id,
      post_type: 'comment',
    })
    await using transaction = await beginTransaction()
    const work = await recordPostPublicationChange(transaction, {
      scope: { type: 'post', postId: targetRoot.id },
      reason: 'post_updated',
      impactedPostIds: [impactedPost.id],
    })
    await transaction.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(await readPublicationAncestorRootHints(claimed)).toEqual(
      new Set([targetRoot.id, impactedRoot.id]),
    )
    const impactedPage = await readRawPublicationCandidatePage(
      testPublicationWorkAtPost(claimed, impactedDescendant.id),
      1,
    )
    expect(impactedPage.postIds).toEqual([impactedDescendant.id])
    const unrelatedPage = await readRawPublicationCandidatePage(
      testPublicationWorkAtPost(claimed, unrelatedComment.id),
      1,
    )
    expect(unrelatedPage.postIds).toEqual([])
    expect(unrelatedPage.pendingPostId).toBeNull()
  })

  it('advances a raw cursor through a page with no eligible posts', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `empty-${crypto.randomUUID()}`)
    const before = await createTestPost({ user })
    const after = await createTestPost({ user })
    await using transaction = await beginTransaction()
    const work = await recordPostPublicationChange(transaction, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    await transaction.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    const page = await readRawPublicationCandidatePage(
      { ...claimed, cursor_post_id: before.id },
      10,
    )
    expect(page.postIds).toEqual([])
    expect(BigInt(`0x${page.cursorPostId!.replaceAll('-', '')}`)).toBeGreaterThanOrEqual(
      BigInt(`0x${after.id.replaceAll('-', '')}`),
    )
    expect(page.pendingPostId).toBeNull()
  })

  it('replays a fixed-size pending ancestor walk and eventually admits a deep descendant', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `deep-${crypto.randomUUID()}`)
    const boundaryAliasId = await createTopHashtagAliasForTest(
      topic.id,
      `boundary-${crypto.randomUUID()}`,
    )
    const deferredAliasId = await createTopHashtagAliasForTest(
      topic.id,
      `deferred-${crypto.randomUUID()}`,
    )
    const root = await createTestPost({ user })
    const source = await createTestPost({ user, parent_post_id: root.id, post_type: 'comment' })
    await createTopHashtagPostSourceForTest({
      postId: source.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: '#deep',
    })
    let parent = source
    let lastVisitedAncestorId: string | null = null
    let firstDeferredAncestorId: string | null = null
    for (let depth = 0; depth < 102; depth++) {
      parent = await createTestPost({ user, parent_post_id: parent.id, post_type: 'comment' })
      if (depth === 0) firstDeferredAncestorId = parent.id
      if (depth === 1) lastVisitedAncestorId = parent.id
    }
    if (!lastVisitedAncestorId || !firstDeferredAncestorId)
      throw new Error('Expected boundary ancestors')
    await createTopHashtagPostSourceForTest({
      postId: lastVisitedAncestorId,
      topicAliasId: boundaryAliasId,
      userId: user.id,
      authoredToken: '#boundary',
    })
    await createTopHashtagPostSourceForTest({
      postId: firstDeferredAncestorId,
      topicAliasId: deferredAliasId,
      userId: user.id,
      authoredToken: '#deferred',
    })
    const deepestId = parent.id
    const priorId = parent.parent_post_id!
    await using transaction = await beginTransaction()
    const work = await recordPostPublicationChange(transaction, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    await transaction.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    const nearEnd = { ...claimed, cursor_post_id: priorId }
    const first = await readRawPublicationCandidatePage(nearEnd, 10)
    expect(first).toMatchObject({
      postIds: [],
      cursorPostId: priorId,
      hasMore: true,
      pendingPostId: deepestId,
      pendingAncestorId: expect.any(String),
    })
    expect(await readRawPublicationCandidatePage(nearEnd, 10)).toEqual(first)

    const fence = {
      id: claimed.id,
      generation: claimed.generation,
      leaseToken: claimed.lease_token,
    }
    expect(
      await updatePostPublicationDirtyWorkCursors(fence, {
        postId: first.cursorPostId,
        pendingPostId: first.pendingPostId,
        pendingAncestorId: first.pendingAncestorId,
      }),
    ).toBe(true)
    const resumed = await readRawPublicationCandidatePage(
      {
        ...nearEnd,
        pending_post_identity_id: first.pendingPostId,
        pending_ancestor_post_identity_id: first.pendingAncestorId,
      },
      10,
    )
    expect(resumed).toMatchObject({
      postIds: [deepestId],
      cursorPostId: deepestId,
      hasMore: true,
      pendingPostId: null,
      pendingAncestorId: null,
    })

    await using boundaryTransaction = await beginTransaction()
    const boundaryWork = await recordPostPublicationChange(boundaryTransaction, {
      scope: { type: 'topic_alias', topicAliasId: boundaryAliasId },
      reason: 'post_topics_changed',
    })
    await boundaryTransaction.commit()
    const boundaryClaim = await claimPostPublicationDirtyWork(boundaryWork, 60)
    if (!boundaryClaim) throw new Error('Expected boundary publication work lease')
    const atBoundary = await readRawPublicationCandidatePage(
      { ...boundaryClaim, cursor_post_id: priorId },
      10,
    )
    expect(atBoundary).toMatchObject({
      postIds: [deepestId],
      pendingPostId: null,
      pendingAncestorId: null,
    })
    expect(BigInt(`0x${atBoundary.cursorPostId!.replaceAll('-', '')}`)).toBeGreaterThanOrEqual(
      BigInt(`0x${deepestId.replaceAll('-', '')}`),
    )

    await using deferredTransaction = await beginTransaction()
    const deferredWork = await recordPostPublicationChange(deferredTransaction, {
      scope: { type: 'topic_alias', topicAliasId: deferredAliasId },
      reason: 'post_topics_changed',
    })
    await deferredTransaction.commit()
    const deferredClaim = await claimPostPublicationDirtyWork(deferredWork, 60)
    if (!deferredClaim) throw new Error('Expected deferred publication work lease')
    const deferredFirst = await readRawPublicationCandidatePage(
      { ...deferredClaim, cursor_post_id: priorId },
      10,
    )
    expect(deferredFirst).toMatchObject({
      postIds: [],
      pendingPostId: deepestId,
      pendingAncestorId: firstDeferredAncestorId,
    })
    expect(
      await updatePostPublicationDirtyWorkCursors(
        {
          id: deferredClaim.id,
          generation: deferredClaim.generation,
          leaseToken: deferredClaim.lease_token,
        },
        {
          postId: deferredFirst.cursorPostId,
          pendingPostId: deferredFirst.pendingPostId,
          pendingAncestorId: deferredFirst.pendingAncestorId,
        },
      ),
    ).toBe(true)
    const deferredResume = await readRawPublicationCandidatePage(
      {
        ...deferredClaim,
        cursor_post_id: priorId,
        pending_post_identity_id: deferredFirst.pendingPostId,
        pending_ancestor_post_identity_id: deferredFirst.pendingAncestorId,
      },
      10,
    )
    expect(deferredResume.postIds).toEqual([deepestId])
  })
})
