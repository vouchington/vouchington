import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import {
  beginTransaction,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  getTestPostPublicationDirtyWorkForScope,
  hardDeleteTestPost,
  setTopHashtagPostRelationScoreForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { linkTopicAlias } from '../topics/aliases.mts'
import {
  claimPostPublicationDirtyWork,
  updatePostPublicationDirtyWorkCursors,
} from './dirty-work.mts'
import {
  reconcileTestPublicationUntilSnapshotsComplete as reconcilePostPublicationDirtyWork,
  getTestPublicationProjectionIdentity,
  testPublicationWorkAtPost,
  testUuidPredecessor,
} from '@voucha/test-helpers/post-publication-fixtures'
import { recordPostPublicationChange } from './capture.mts'

describe('topic alias publication reconciliation', () => {
  it('pages a topic alias source set and retains both current and prior topic owners', async () => {
    const user = await createTestUser()
    const [owner, priorOwner] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const aliasId = await createTopHashtagAliasForTest(owner.id, `alias-${crypto.randomUUID()}`)
    const posts = await Promise.all(Array.from({ length: 3 }, () => createTestPost({ user })))
    await Promise.all(
      posts.map(post =>
        createTopHashtagPostSourceForTest({
          postId: post.id,
          topicAliasId: aliasId,
          userId: user.id,
          authoredToken: '#alias',
        }),
      ),
    )
    await using publicationChangeQuery = await beginTransaction()
    const work = await recordPostPublicationChange(publicationChangeQuery, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
      impactedTopicIds: [priorOwner.id],
    })
    await publicationChangeQuery.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected topic alias publication work lease')

    const sortedPostIds = posts.map(post => post.id).toSorted()
    const firstPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, sortedPostIds[0]!),
      2,
    )

    expect(firstPage).toMatchObject({ hasMorePosts: true, topicIds: [] })
    expect(firstPage.posts.map(post => post.id)).toEqual(sortedPostIds.slice(0, 2))
    expect((await getTestPublicationProjectionIdentity(firstPage.posts[0]!)).topicIds).toEqual([
      owner.id,
    ])
    const fence = {
      id: claimed.id,
      generation: claimed.generation,
      leaseToken: claimed.lease_token,
    }
    await expect(
      updatePostPublicationDirtyWorkCursors(fence, { postId: firstPage.cursorPostId }),
    ).resolves.toBe(true)

    const finalPostPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, sortedPostIds[2]!),
      1,
    )
    expect(finalPostPage.posts.map(post => post.id)).toEqual(sortedPostIds.slice(2))
    const terminalPage = await reconcilePostPublicationDirtyWork(
      { ...claimed, cursor_post_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
      2,
    )
    expect(terminalPage).toMatchObject({ posts: [], hasMorePosts: false, hasMoreTopics: false })
    expect(terminalPage.topicIds).toEqual(expect.arrayContaining([owner.id, priorOwner.id]))
  })

  it('restarts topic alias source pagination from the first page on a replacement generation', async () => {
    const user = await createTestUser()
    const [initialOwner, replacementOwner] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const aliasId = await createTopHashtagAliasForTest(
      initialOwner.id,
      `alias-${crypto.randomUUID()}`,
    )
    const posts = await Promise.all(Array.from({ length: 2 }, () => createTestPost({ user })))
    await Promise.all(
      posts.map(post =>
        createTopHashtagPostSourceForTest({
          postId: post.id,
          topicAliasId: aliasId,
          userId: user.id,
          authoredToken: '#alias',
        }),
      ),
    )
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
      impactedTopicIds: [initialOwner.id],
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected topic alias publication work lease')
    const firstPostId = posts.map(post => post.id).toSorted()[0]!
    const firstPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, firstPostId),
      1,
    )
    await expect(
      updatePostPublicationDirtyWorkCursors(
        { id: claimed.id, generation: claimed.generation, leaseToken: claimed.lease_token },
        { postId: firstPage.cursorPostId },
      ),
    ).resolves.toBe(true)

    await softDeleteTopic(initialOwner.id, user.id)
    await linkTopicAlias(replacementOwner.id, aliasId)
    const replacement = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId,
    })
    if (!replacement) throw new Error('Expected replacement topic alias work')
    const replacementClaim = await claimPostPublicationDirtyWork(replacement, 60)
    if (!replacementClaim) throw new Error('Expected replacement topic alias work lease')

    expect(replacement.cursor_post_id).toBeNull()
    const restarted = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(replacementClaim, firstPostId),
      1,
    )

    expect(Number(replacement.generation)).toBeGreaterThan(Number(claimed.generation))
    expect(restarted).toMatchObject({ hasMorePosts: true, cursorPostId: firstPage.cursorPostId })
    expect(restarted.posts.map(post => post.id)).toEqual(firstPage.posts.map(post => post.id))
  })

  it('re-reads the exact selected post IDs after alias membership changes', async () => {
    const user = await createTestUser()
    const owner = await createTestTopic({ user })
    const aliasId = await createTopHashtagAliasForTest(owner.id, `alias-${crypto.randomUUID()}`)
    const selectedPost = await createTestPost({ user })
    await createTopHashtagPostSourceForTest({
      postId: selectedPost.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: '#selected',
    })
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected topic alias publication work lease')
    const selected = await reconcilePostPublicationDirtyWork(
      { ...claimed, cursor_post_id: testUuidPredecessor(selectedPost.id) },
      1,
    )

    const replacementPost = await createTestPost({ user })
    await using sourceDeletionQuery = await beginTransaction()
    await sourceDeletionQuery(
      allowUnannotatedQuery(
        `DELETE FROM post_topic_alias_sources WHERE post_id = $1 AND topic_alias_id = $2`,
      ),
      [selectedPost.id, aliasId],
    )
    await sourceDeletionQuery.commit()
    // End the relation-only membership too, not just the source row: createTopHashtagPostSourceForTest
    // seeded both, and a positive relation alone still qualifies as a candidate under the
    // authorship-∪-membership rule (#11079), independent of the read-side membership-only rule (#11078).
    await setTopHashtagPostRelationScoreForTest({
      postId: selectedPost.id,
      topicAliasId: aliasId,
      score: 0,
    })
    await createTopHashtagPostSourceForTest({
      postId: replacementPost.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: '#replacement',
    })

    const reread = await reconcilePostPublicationDirtyWork(claimed, 1, {
      postIds: selected.posts.map(post => post.id),
      hasMore: selected.hasMorePosts,
    })
    const withoutOld = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, selectedPost.id),
      1,
    )
    const newSelection = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, replacementPost.id),
      1,
    )

    expect(reread.posts.map(post => post.id)).toEqual([selectedPost.id])
    expect(withoutOld.posts.map(post => post.id)).not.toContain(selectedPost.id)
    expect(newSelection.posts.map(post => post.id)).toEqual([replacementPost.id])
  })

  it('preserves the selected page cursor when a selected post is hard-deleted', async () => {
    const user = await createTestUser()
    const owner = await createTestTopic({ user })
    const aliasId = await createTopHashtagAliasForTest(owner.id, `alias-${crypto.randomUUID()}`)
    const posts = await Promise.all(Array.from({ length: 2 }, () => createTestPost({ user })))
    await Promise.all(
      posts.map(post =>
        createTopHashtagPostSourceForTest({
          postId: post.id,
          topicAliasId: aliasId,
          userId: user.id,
          authoredToken: '#deleted',
        }),
      ),
    )
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected topic alias publication work lease')
    const selected = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, posts.map(post => post.id).toSorted()[0]!),
      1,
    )
    const selectedPostId = selected.posts[0]!.id
    await hardDeleteTestPost(selectedPostId)

    const reread = await reconcilePostPublicationDirtyWork(claimed, 1, {
      postIds: [selectedPostId],
      hasMore: selected.hasMorePosts,
    })
    const remainingId = posts.map(post => post.id).find(postId => postId !== selectedPostId)!
    const nextPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, remainingId),
      1,
    )

    expect(reread).toMatchObject({ posts: [], hasMorePosts: true, cursorPostId: selectedPostId })
    expect(nextPage.posts.map(post => post.id)).toEqual([remainingId])
  })
})
