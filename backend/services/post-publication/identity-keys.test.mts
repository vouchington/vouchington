import {
  beginTransaction,
  createTestPost,
  createTestUser,
  getTestPostPublicationDirtyWorkGenerationForAuthor,
  getTestPostPublicationDirtyWorkTopicCursor,
  insertTestCommunity,
  listTestPostPublicationIdentityKeys,
  scrubTestUserUsernameInTransaction,
  setTestPostPublicationDirtyWorkTopicCursor,
  updateTestPostSlugInTransaction,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  recordAuthorDeletionBeforePostReassignment,
  recordRssFeedHardDeletePublicationChange,
} from './capture-deletions.mts'
import {
  claimPostPublicationDirtyWork,
  updatePostPublicationDirtyWorkCursors,
} from './dirty-work.mts'
import {
  reconcileTestPublicationUntilSnapshotsComplete as reconcilePostPublicationDirtyWork,
  getTestPublicationProjectionIdentity,
} from './test-fixtures.mts'
import { recordPostPublicationChange } from './capture.mts'
import { retainPostPublicationKeys } from './retained-key-writes.mts'

describe('post publication retained identity keys', () => {
  it('coalesces A to B to C and drains a NULL first cursor page once', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected identity author')
    const post = await createTestPost({ user })
    const work = await ['b-publication-slug', 'c-publication-slug'].reduce(
      (pending, priorPostSlug) =>
        pending.then(() => recordPostSlugPublicationChange(post.id, priorPostSlug)),
      recordPostSlugPublicationChange(post.id, 'a-publication-slug'),
    )
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected identity work lease')
    const afterPosts = { ...claimed, cursor_post_id: post.id }
    const firstPage = await reconcilePostPublicationDirtyWork(afterPosts, 1)
    expect(firstPage.identityKeys).toHaveLength(1)
    const fence = {
      id: claimed.id,
      generation: claimed.generation,
      leaseToken: claimed.lease_token,
    }
    await expect(
      updatePostPublicationDirtyWorkCursors(fence, { keyId: firstPage.identityKeys[0]!.id }),
    ).resolves.toBe(true)
    const secondPage = await reconcilePostPublicationDirtyWork(
      { ...afterPosts, cursor_key_id: firstPage.identityKeys[0]!.id },
      1,
    )
    expect(secondPage.identityKeys[0]).not.toEqual(firstPage.identityKeys[0])
  })

  it('retains author, community, community-slug, and post-slug tombstones before deletion', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected deletion identity author')
    const community = await insertTestCommunity({ createdById: user.id })
    const post = await createTestPost({ user, community_id: community.id })
    const oldSlug = `old-publication-${post.id}`
    await using query = await beginTransaction()
    await updateTestPostSlugInTransaction(query, post.id, oldSlug)
    await recordAuthorDeletionBeforePostReassignment(query, user.id)
    await query.commit()
    await expect(
      listTestPostPublicationIdentityKeys({ authorUserId: user.id, postId: post.id }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { kind: 'author', value: user.id },
        { kind: 'community', value: community.id },
        { kind: 'post_slug', value: oldSlug },
      ]),
    )
  })

  it('retains an author username for a retry after the profile scrub clears it', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected scrubbed identity author')
    await using query = await beginTransaction()
    await recordAuthorDeletionBeforePostReassignment(query, user.id)
    await scrubTestUserUsernameInTransaction(query, user.id)
    await query.commit()
    const pendingWork = await getTestPostPublicationDirtyWorkGenerationForAuthor(user.id)
    if (!pendingWork) throw new Error('Expected scrubbed author publication work')
    const work = await claimPostPublicationDirtyWork(pendingWork, 60)
    if (!work) throw new Error('Expected scrubbed author work lease')

    await expect(reconcilePostPublicationDirtyWork(work)).resolves.toMatchObject({
      identityKeys: expect.arrayContaining([
        expect.objectContaining({ kind: 'author', value: user.username }),
      ]),
    })
  })

  it('retains and pages more than one thousand exact RSS-feed identities', async () => {
    const post = await createTestPost()
    await using workQuery = await beginTransaction()
    const work = await recordPostPublicationChange(workQuery, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_created',
    })
    await workQuery.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected high-fanout identity work lease')
    await using identityQuery = await beginTransaction()
    await retainPostPublicationKeys(
      identityQuery,
      claimed.id,
      Array.from({ length: 1_001 }, (_, index) => ({
        kind: 'identity_rss_feed' as const,
        uuidValue: `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
      })),
    )
    await identityQuery.commit()

    const result = await reconcilePostPublicationDirtyWork(
      { ...claimed, cursor_post_id: post.id },
      100,
    )

    expect(result).toMatchObject({ hasMoreIdentityKeys: true })
    expect(result.identityKeys.length).toBeGreaterThan(0)
    expect(result.identityKeys.length).toBeLessThanOrEqual(100)
    expect(result.identityKeys).toContainEqual(expect.objectContaining({ kind: 'rss_feed' }))
  })

  it('moves canonical current identities into the retained-key page', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected current identity author')
    const post = await createTestPost({ user })
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_created',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected current identity work lease')
    const selected = await reconcilePostPublicationDirtyWork(claimed)
    const canonical = await reconcilePostPublicationDirtyWork(
      claimed,
      undefined,
      selected.posts.map(candidate => candidate.id),
    )

    expect((await getTestPublicationProjectionIdentity(canonical.posts[0]!)).identityKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'author', value: user.id })]),
    )
    expect(canonical.identityKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'author', value: user.id })]),
    )
  })

  it('resets author and RSS topic cursors to every replacement generation', async () => {
    expect.assertions(2)
    const user = await createTestUser()
    if (!user) throw new Error('Expected cursor-reset author')
    const post = await createTestPost({ user })
    await using authorChangeQuery = await beginTransaction()
    await recordAuthorDeletionBeforePostReassignment(authorChangeQuery, user.id)
    await authorChangeQuery.commit()
    await setTestPostPublicationDirtyWorkTopicCursor({
      column: 'author_user_id',
      scopeId: user.id,
      cursorTopicId: post.id,
    })
    await using replacementAuthorChangeQuery = await beginTransaction()
    await recordAuthorDeletionBeforePostReassignment(replacementAuthorChangeQuery, user.id)
    await replacementAuthorChangeQuery.commit()
    await expectDeletionTopicCursorReset(user.id, 'author_user_id')
    await using rssChangeQuery = await beginTransaction()
    await recordRssFeedHardDeletePublicationChange(rssChangeQuery, user.id)
    await rssChangeQuery.commit()
    await setTestPostPublicationDirtyWorkTopicCursor({
      column: 'rss_feed_id',
      scopeId: user.id,
      cursorTopicId: post.id,
    })
    await using replacementRssChangeQuery = await beginTransaction()
    await recordRssFeedHardDeletePublicationChange(replacementRssChangeQuery, user.id)
    await replacementRssChangeQuery.commit()
    await expectDeletionTopicCursorReset(user.id, 'rss_feed_id')
  })
})

async function expectDeletionTopicCursorReset(
  scopeId: string,
  column: 'author_user_id' | 'rss_feed_id',
): Promise<void> {
  const cursor = await getTestPostPublicationDirtyWorkTopicCursor({ column, scopeId })
  expect(cursor).toEqual(
    expect.objectContaining({ generation: expect.any(String), cursor_topic_id: null }),
  )
}

async function recordPostSlugPublicationChange(postId: string, priorPostSlug: string) {
  await using query = await beginTransaction()
  const work = await recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'post_updated',
    footprint: { priorPostSlug },
  })
  await query.commit()
  return work
}
