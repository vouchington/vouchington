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
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import { getPostFeedIds } from '../get-ids.mts'
import type { PostFeedOptions } from '../../types.mts'
import { createTestPostId } from '@voucha/test-helpers/entities/post-ids'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'

async function findOwnedDelivery(
  viewer: Parameters<typeof getPostFeedIds>[0],
  options: PostFeedOptions,
  targetId: string,
) {
  const results: Awaited<ReturnType<typeof getPostFeedIds>>['results'] = []
  let after: string | undefined
  for (let index = 0; index < 30; index++) {
    const page = await getPostFeedIds(viewer, { ...options, after })
    results.push(...page.results)
    if (page.results.some(row => row.id === targetId)) return { results, inputCursor: after, page }
    if (!page.page_info.has_next_page) break
    const next = page.page_info.end_cursor ?? undefined
    if (!next || next === after) throw new Error('Expected advancing feed cursor')
    after = next
  }
  throw new Error('Expected owned delivery in bounded pages')
}

describe('post share delivery pagination', () => {
  it.each(['new', 'hot'] as const)(
    'retains direct and repeated-target deliveries across %s pages',
    async sort => {
      const viewer = await createTestUser()
      const creator = await createTestUser()
      const sharer = await createTestUser()
      await followUser(viewer, creator)
      const createdAt = new Date('9999-12-31T23:59:59.000Z')
      const post =
        sort === 'hot'
          ? { id: createTestPostId(createdAt) }
          : await createTestPost({ user: creator })
      try {
        if (sort === 'hot')
          await insertTestPost({
            id: post.id,
            createdAt,
            createdById: creator.id,
            title: 'Fixed-age hot delivery target',
            slug: randomUUID(),
            markdown: 'Hot delivery target',
          })
        await setPostVotesScoreUp(post.id, 1)
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
        const expectedIds = [post.id, ...sharedIds].toSorted().toReversed()
        const delivered = []
        let after: string | undefined
        for (let pageIndex = 0; pageIndex < 30; pageIndex++) {
          const page = await getPostFeedIds(viewer, {
            feed_type: 'follow_users',
            sort,
            limit: 1,
            after,
          })
          delivered.push(...page.results)
          if (delivered.length === expectedIds.length || !page.page_info.has_next_page) break
          const next = page.page_info.end_cursor
          if (!next || next === after) throw new Error('Expected advancing continuation cursor')
          after = next
        }
        expect(delivered.map(row => row.id)).toEqual(expectedIds)
        expect(new Set(delivered.map(row => row.id)).size).toBe(expectedIds.length)
        expect(delivered.map(row => row.entity_id)).toEqual(expectedIds.map(() => post.id))
        expect(delivered.filter(row => row.delivery_type === 'share')).toHaveLength(2)
        expect(delivered.filter(row => row.delivery_type === 'direct')).toHaveLength(1)
        for (const feed_type of ['all', 'follow_topics'] as const) {
          const page = await getPostFeedIds(viewer, { feed_type, sort, limit: 10 })
          expect(page.results.some(row => row.delivery_type === 'share')).toBe(false)
        }
      } finally {
        await deleteTestPost(post.id)
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
    const agedId = await insertPostFeedShareForTest({
      recipientUserId: viewer.id,
      sharedByUserId: creator.id,
      postId,
      sortAt: new Date(Date.now() - 30 * 86_400_000),
    })
    const options: PostFeedOptions = { feed_type: 'follow_users', time_range: '1d', limit: 10 }
    const found = await findOwnedDelivery(viewer, options, freshId)
    expect(found.results.map(row => row.id)).toEqual([freshId])
    expect(found.results[0]?.entity_id).toBe(postId)
    if (found.page.page_info.has_next_page) {
      const after = found.page.page_info.end_cursor
      if (!after) throw new Error('Expected advancing feed cursor')
      const next = await getPostFeedIds(viewer, { ...options, after })
      found.results.push(...next.results)
    }
    expect(found.results.map(row => row.id)).not.toContain(agedId)
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
    const rejectedIds: string[] = []
    for (const postId of [hidden.id, muted.id, excludedTopic.id])
      rejectedIds.push(
        await insertPostFeedShareForTest({
          recipientUserId: viewer.id,
          sharedByUserId: creator.id,
          postId,
        }),
      )
    rejectedIds.push(
      await insertPostFeedShareForTest({
        recipientUserId: viewer.id,
        sharedByUserId: mutedSharer.id,
        postId: visible.id,
      }),
    )
    const found = await findOwnedDelivery(
      viewer,
      { feed_type: 'follow_users', limit: 10 },
      visibleId,
    )
    expect(found.results.map(row => row.id)).toEqual([visibleId])
    expect(found.results.some(row => rejectedIds.includes(row.id))).toBe(false)
    for (const options of [
      { post_types: ['review'] },
      { text_search_query: 'missinguniquetoken' },
      { has_unknown_hashtag: true },
    ] satisfies PostFeedOptions[]) {
      expect(
        (
          await getPostFeedIds(viewer, {
            feed_type: 'follow_users',
            limit: 10,
            after: found.inputCursor,
            ...options,
          })
        ).results,
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
      parent_post_id: root.id,
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
    const found = await findOwnedDelivery(viewer, options, shareId)
    expect(found.results.map(row => row.id)).toEqual([shareId])
    await setPostDeletedForTest(root.id)
    expect(
      (await getPostFeedIds(viewer, { ...options, after: found.inputCursor })).results,
    ).toEqual([])
  })
})
