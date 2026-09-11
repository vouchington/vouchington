import { it, expect, describe } from 'vitest'
import { getPostIds } from '../get-ids.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestUserDirect,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  insertTestPost,
  insertTestReview,
  createRandomString,
} from '@voucha/test-helpers'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { waitForPostMatchingRelatedTopicIds } from '../test-support.mts'

describe('get-ids (filters)', () => {
  it('getPostIds sort=new returns user posts by UUIDv7 newest first', async () => {
    const user = await createTestUserDirect()
    const createdAt = Date.now()
    const slugSuffix = createRandomString(10)
    const post1Id = await insertTestPost({
      title: 'Test Post Sort New 1',
      slug: `test-post-sort-new-${slugSuffix}-1`,
      markdown: 'Test post sort new description 1',
      createdById: user.id,
      createdAt: new Date(createdAt),
    })
    const post2Id = await insertTestPost({
      title: 'Test Post Sort New 2',
      slug: `test-post-sort-new-${slugSuffix}-2`,
      markdown: 'Test post sort new description 2',
      createdById: user.id,
      createdAt: new Date(createdAt + 1),
    })
    const post3Id = await insertTestPost({
      title: 'Test Post Sort New 3',
      slug: `test-post-sort-new-${slugSuffix}-3`,
      markdown: 'Test post sort new description 3',
      createdById: user.id,
      createdAt: new Date(createdAt + 2),
    })

    const result = await getPostIds(undefined, {
      user_id: user.id,
      sort: 'new',
      limit: 10,
    })

    expect(result.results.map(r => r.id)).toEqual([post3Id, post2Id, post1Id])
  })

  it('getPostIds filters by user_id', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()

    const post1 = await createTestPost({ user: user1 })
    await createTestPost({ user: user2 })

    const result = await getPostIds(undefined, { user_id: user1!.id, limit: 100 })

    const foundPost1 = result.results.find(r => r.id === post1.id)
    expect(foundPost1).toBeDefined()
  })

  it('getPostIds filters by post_types', async () => {
    const user = await createTestUser()
    const discussion = await createTestPost({ user, post_type: 'discussion' })

    const result = await getPostIds(undefined, { post_types: ['discussion'], limit: 100 })

    const foundDiscussion = result.results.find(r => r.id === discussion.id)
    expect(foundDiscussion).toBeDefined()
    expect(foundDiscussion?.post_type).toBe('discussion')
  })

  it('getPostIds filters by review_topic_ids', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()

    const reviewId = await insertTestReview({
      userId: user!.id,
      topicRatings: [{ topicId: topic.id, rating: 5 }],
      title: 'Great product',
      markdown: 'I love it',
    })
    const result = await getPostIds(undefined, { review_topic_ids: [topic.id], limit: 100 })

    const foundReview = result.results.find(r => r.id === reviewId)
    expect(foundReview).toBeDefined()
    expect(foundReview?.post_type).toBe('review')
  })

  it('getPostIds filters by related_topic_ids (AND logic)', async () => {
    const user = await createTestUser()
    const topic1 = await createTestTopic()
    const topic2 = await createTestTopic()
    const post = await createTestPost({ user })

    // Get metadata for post->topic relation
    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
    )!

    // Relate post to both topics
    await upsertEntityRelation(user!, metadata, post, [topic1, topic2])

    await waitForPostMatchingRelatedTopicIds(undefined, post.id, [topic1.id, topic2.id], 100)
    const result = await getPostIds(undefined, {
      related_topic_ids: [topic1.id, topic2.id],
      limit: 100,
    })

    const foundPost = result.results.find(r => r.id === post.id)
    expect(foundPost).toBeDefined()
  })

  it('getPostIds finds hashtag-only posts by universal topic', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const post = await createTestPost({ user })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `search-tag-${post.id}`)

    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: `#search-tag-${post.id}`,
    })

    const result = await getPostIds(undefined, {
      universal_topic_ids: [topic.id],
      limit: 100,
    })

    expect(result.results.map(row => row.id)).toContain(post.id)
  })

  it('getPostIds includes metadata in results', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })

    const result = await getPostIds(undefined, { user_id: user!.id, limit: 10 })

    const foundPost = result.results.find(r => r.id === post.id)
    expect(foundPost).toBeDefined()
  })

  it('getPostIds returns page_info with has_next_page', async () => {
    const user = await createTestUser()
    await createTestPost({ user })
    await createTestPost({ user })
    await createTestPost({ user })

    // Request with limit 2
    const result = await getPostIds(undefined, { user_id: user!.id, limit: 2 })

    expect(result.page_info).toBeDefined()
    expect(typeof result.page_info.has_next_page).toBe('boolean')

    expect(result.results.length).toBe(2)
    expect(result.page_info.has_next_page).toBe(true)
  })
})
