import {
  acquireTestPublicationIdentityBridgeCleanupReservation,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  hardDeleteTestPost,
  readTestPublicationIdentityBridge,
  visitTestPublicationPostIdentityCandidates,
} from '@voucha/test-helpers'
import {
  createTestPendingPostIdentityIds,
  recordTestPostPublicationChange,
} from '@voucha/test-helpers/post-publication-fixtures'
import { describe, expect, it } from 'vitest'
import {
  claimPostPublicationDirtyWork,
  updatePostPublicationDirtyWorkCursors,
} from './dirty-work.mts'
import { readRawPublicationCandidatePage } from './raw-candidate-page.mts'

describe('publication pending retained post identities', () => {
  it('does not admit a pending candidate deleted after its identity checkpoint', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `candidate-${crypto.randomUUID()}`)
    const ancestor = await createTestPost({ user })
    const candidate = await createTestPost({
      user,
      parent_post_id: ancestor.id,
      post_type: 'comment',
    })
    const work = await recordTestPostPublicationChange({
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(
      await updatePostPublicationDirtyWorkCursors(
        { id: claimed.id, generation: claimed.generation, leaseToken: claimed.lease_token },
        { pendingPostId: candidate.id, pendingAncestorId: ancestor.id },
      ),
    ).toBe(true)
    await hardDeleteTestPost(candidate.id)
    expect(await readTestPublicationIdentityBridge('post', candidate.id)).toEqual({
      id: candidate.id,
      live_id: null,
    })
    const page = await readRawPublicationCandidatePage(
      {
        ...claimed,
        pending_post_identity_id: candidate.id,
        pending_ancestor_post_identity_id: ancestor.id,
      },
      10,
    )
    expect(page).toMatchObject({
      postIds: [],
      cursorPostId: candidate.id,
      hasMore: true,
      pendingPostId: null,
      pendingAncestorId: null,
    })
  })

  it('clears a pending walk when its ancestor and cascading descendant were deleted', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `deleted-${crypto.randomUUID()}`)
    const root = await createTestPost({ user })
    const source = await createTestPost({ user, parent_post_id: root.id, post_type: 'comment' })
    const descendant = await createTestPost({
      user,
      parent_post_id: source.id,
      post_type: 'comment',
    })
    const work = await recordTestPostPublicationChange({
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(
      await updatePostPublicationDirtyWorkCursors(
        { id: claimed.id, generation: claimed.generation, leaseToken: claimed.lease_token },
        { pendingPostId: descendant.id, pendingAncestorId: source.id },
      ),
    ).toBe(true)
    await hardDeleteTestPost(source.id)
    expect(await readTestPublicationIdentityBridge('post', source.id)).toEqual({
      id: source.id,
      live_id: null,
    })
    expect(await readTestPublicationIdentityBridge('post', descendant.id)).toEqual({
      id: descendant.id,
      live_id: null,
    })
    const page = await readRawPublicationCandidatePage(
      {
        ...claimed,
        pending_post_identity_id: descendant.id,
        pending_ancestor_post_identity_id: source.id,
      },
      10,
    )
    expect(page).toMatchObject({
      postIds: [],
      cursorPostId: descendant.id,
      hasMore: true,
      pendingPostId: null,
      pendingAncestorId: null,
    })
  })
  it('rolls back new bridge rows when a generation loses its claim', async () => {
    const scope = await createTestPost()
    const work = await recordTestPostPublicationChange({
      scope: { type: 'post', postId: scope.id },
      reason: 'post_updated',
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    await recordTestPostPublicationChange({
      scope: { type: 'post', postId: scope.id },
      reason: 'post_updated',
    })
    const { candidateId, ancestorId } = await createTestPendingPostIdentityIds()
    expect(
      await updatePostPublicationDirtyWorkCursors(
        { id: claimed.id, generation: claimed.generation, leaseToken: claimed.lease_token },
        { pendingPostId: candidateId, pendingAncestorId: ancestorId },
      ),
    ).toBe(false)
    expect(await readTestPublicationIdentityBridge('post', candidateId)).toBeUndefined()
    expect(await readTestPublicationIdentityBridge('post', ancestorId)).toBeUndefined()
  })

  it('keeps both retained resume identities through bounded bridge cleanup', async () => {
    const candidate = await createTestPost()
    const ancestor = await createTestPost()
    const scope = await createTestPost()
    const work = await recordTestPostPublicationChange({
      scope: { type: 'post', postId: scope.id },
      reason: 'post_updated',
    })
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(
      await updatePostPublicationDirtyWorkCursors(
        { id: claimed.id, generation: claimed.generation, leaseToken: claimed.lease_token },
        { pendingPostId: candidate.id, pendingAncestorId: ancestor.id },
      ),
    ).toBe(true)
    const reservation = await acquireTestPublicationIdentityBridgeCleanupReservation()
    try {
      expect(await visitTestPublicationPostIdentityCandidates([candidate.id, ancestor.id])).toEqual(
        [],
      )
    } finally {
      await reservation.release()
    }
    expect(await readTestPublicationIdentityBridge('post', candidate.id)).toBeDefined()
    expect(await readTestPublicationIdentityBridge('post', ancestor.id)).toBeDefined()
  })
})
