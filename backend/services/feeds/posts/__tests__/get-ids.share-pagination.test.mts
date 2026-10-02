import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  createTestPost,
  followUser,
  insertPostFeedShareForTest,
  insertTestPost,
  hidePost,
  muteUser,
  muteTopic,
  createTestTopic,
  insertScoredPostTopicCategoryRelation,
  setPostDeletedForTest,
} from '@voucha/test-helpers'
import { getPostFeedIds } from '../get-ids.mts'
import type { PostFeedOptions } from '../../types.mts'

describe('post share delivery pagination', () => {
  it.each(['new', 'hot'] as const)(
    'retains direct and repeated-target deliveries across %s pages',
    async sort => {
      const viewer = await createTestUser()
      const creator = await createTestUser()
      const sharer = await createTestUser()
      await followUser(viewer, creator)
      const post = await createTestPost({ user: creator })
      const sharedIds = []
      for (const sharedByUserId of [creator.id, sharer.id]) {
        sharedIds.push(
          await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId,
            postId: post.id,
          }),
        )
      }
      const expectedIds = [post.id, ...sharedIds].toSorted().reverse()
      const delivered = []
      let after: string | undefined
      for (const id of expectedIds) {
        const page = await getPostFeedIds(viewer, {
          feed_type: 'follow_users',
          sort,
          limit: 1,
          after,
        })
        expect(page.results.map(row => row.id)).toEqual([id])
        expect(page.results[0]?.entity_id).toBe(post.id)
        delivered.push(page.results[0]!)
        after = page.page_info.end_cursor ?? undefined
        expect(page.page_info.has_next_page).toBe(id !== expectedIds.at(-1))
      }
      expect(delivered.map(row => row.delivery_type)).toEqual(['share', 'share', 'direct'])
      for (const feed_type of ['all', 'follow_topics'] as const) {
        const page = await getPostFeedIds(viewer, { feed_type, sort, limit: 10 })
        expect(page.results.some(row => row.delivery_type === 'share')).toBe(false)
      }
    },
  )
  it('shares older targets by delivery time and excludes aged deliveries', async () => {
    const viewer = await createTestUser()
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: 'Old shared target',
      slug: randomUUID(),
      markdown: 'Old target',
      createdById: creator.id,
      createdAt: new Date(Date.now() - 30 * 86_400_000),
    })
    const freshId = await insertPostFeedShareForTest({
      recipientUserId: viewer.id,
      sharedByUserId: creator.id,
      postId,
    })
    await insertPostFeedShareForTest({
      recipientUserId: viewer.id,
      sharedByUserId: creator.id,
      postId,
      sortAt: new Date(Date.now() - 30 * 86_400_000),
    })
    const page = await getPostFeedIds(viewer, {
      feed_type: 'follow_users',
      time_range: '1d',
      limit: 10,
    })
    expect(page.results.map(row => row.id)).toEqual([freshId])
    expect(page.results[0]?.entity_id).toBe(postId)
  })
  it('applies the same hidden, muted, topic and request eligibility to share targets', async () => {
    const viewer = await createTestUser()
    const creator = await createTestUser()
    const mutedCreator = await createTestUser()
    const mutedSharer = await createTestUser()
    const topic = await createTestTopic()
    const visible = await createTestPost({ user: creator, title: 'Eligible shared discussion' })
    const hidden = await createTestPost({ user: creator })
    const muted = await createTestPost({ user: mutedCreator })
    const excludedTopic = await createTestPost({ user: creator })
    await hidePost(viewer, hidden)
    await muteUser(viewer, mutedCreator)
    await muteUser(viewer, mutedSharer)
    await insertScoredPostTopicCategoryRelation(excludedTopic.id, topic.id, creator.id)
    await muteTopic(viewer, topic)
    const visibleId = await insertPostFeedShareForTest({
      recipientUserId: viewer.id,
      sharedByUserId: creator.id,
      postId: visible.id,
    })
    for (const postId of [hidden.id, muted.id, excludedTopic.id])
      await insertPostFeedShareForTest({
        recipientUserId: viewer.id,
        sharedByUserId: creator.id,
        postId,
      })
    await insertPostFeedShareForTest({
      recipientUserId: viewer.id,
      sharedByUserId: mutedSharer.id,
      postId: visible.id,
    })
    const page = await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 10 })
    expect(page.results.map(row => row.id)).toEqual([visibleId])
    for (const options of [
      { post_types: ['review'] },
      { text_search_query: 'missinguniquetoken' },
      { has_unknown_hashtag: true },
    ] satisfies PostFeedOptions[]) {
      expect(
        (await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 10, ...options }))
          .results,
      ).toEqual([])
    }
  })
  it('applies resolved root publication eligibility to shared comments', async () => {
    const viewer = await createTestUser()
    const rootCreator = await createTestUser()
    const commenter = await createTestUser()
    const root = await createTestPost({ user: rootCreator })
    const comment = await createTestPost({
      user: commenter,
      post_type: 'comment',
      parent_id: root.id,
    })
    const shareId = await insertPostFeedShareForTest({
      recipientUserId: viewer.id,
      sharedByUserId: rootCreator.id,
      postId: comment.id,
    })
    const options: PostFeedOptions = {
      feed_type: 'follow_users',
      post_types: ['comment'],
      limit: 10,
    }
    expect((await getPostFeedIds(viewer, options)).results.map(row => row.id)).toEqual([shareId])
    await setPostDeletedForTest(root.id)
    expect((await getPostFeedIds(viewer, options)).results).toEqual([])
  })
})
