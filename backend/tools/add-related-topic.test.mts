import { expect, it, describe } from 'vitest'
import { randomUUID } from 'node:crypto'
import addRelatedTopicTool from './add-related-topic.mts'
import {
  getEntityRelation,
  createTestUser,
  createTestPost,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  setupTestAutotaggerAgent,
} from '@voucha/test-helpers'
import { getPrivateUserByAny } from '@services/users'

describe('add-related-topic', () => {
  it('has correct schema', () => {
    expect(addRelatedTopicTool.schema).toBeDefined()
    expect(addRelatedTopicTool.schema.type).toBe('function')
    expect(addRelatedTopicTool.schema.name).toBe('add_related_topic')
    expect(addRelatedTopicTool.schema.parameters?.required).toEqual(['topic_id'])
  })

  it('throws error when topic not found', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user: user })
    const execute = addRelatedTopicTool.function(user, 'post', post.id)

    await expect(
      execute({
        topic_id: randomUUID(),
      }),
    ).rejects.toThrow('not found')
  })

  it('throws error when post not found', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user })
    const execute = addRelatedTopicTool.function(user, 'post', randomUUID())

    await expect(
      execute({
        topic_id: topic.id,
      }),
    ).rejects.toThrow('not found')
  })

  it('creates post-topic relation', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user })
    const post = await createTestPost({ user: user })
    const execute = addRelatedTopicTool.function(user, 'post', post.id)

    const result = await execute({
      topic_id: topic.id,
    })

    expect(result.success).toBe(true)
    expect(result.topic_id).toBe(topic.id)
    expect(result.topic_name).toBe(topic.name)

    const rows = (await getEntityRelation(
      'relation__post__category__topic',
      post.id,
      topic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows).toHaveLength(1)
    expect(rows[0].deleted_at).toBeNull()
  })

  it('rejects post-topic relation for unrelated users', async () => {
    const creator = await createTestUser()
    const unrelatedUser = await createTestUser()
    const topic = await createTestTopic({ user: creator })
    const post = await createTestPost({ user: creator })
    const execute = addRelatedTopicTool.function(unrelatedUser, 'post', post.id)

    await expect(execute({ topic_id: topic.id })).rejects.toMatchObject({ status: 403 })

    const rows = await getEntityRelation('relation__post__category__topic', post.id, topic.id)
    expect(rows).toHaveLength(0)
  })

  it('allows admin users to create post-topic relations', async () => {
    const creator = await createTestUser()
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: creator })
    const post = await createTestPost({ user: creator })
    const execute = addRelatedTopicTool.function(admin, 'post', post.id)

    const result = await execute({ topic_id: topic.id })

    expect(result.success).toBe(true)
    const rows = await getEntityRelation('relation__post__category__topic', post.id, topic.id)
    expect(rows).toHaveLength(1)
  })

  it('allows the autotagger agent to create post-topic relations', async () => {
    await setupTestAutotaggerAgent()
    const autotagger = await getPrivateUserByAny('autotagger')
    expect(autotagger?.is_agent).toBe(true)
    const creator = await createTestUser()
    const topic = await createTestTopic({ user: creator })
    const post = await createTestPost({ user: creator })
    const execute = addRelatedTopicTool.function(autotagger!, 'post', post.id)

    const result = await execute({ topic_id: topic.id })

    expect(result.success).toBe(true)
    const rows = await getEntityRelation('relation__post__category__topic', post.id, topic.id)
    expect(rows).toHaveLength(1)
  })

  it('creates rss-feed-item-topic relation for admin users', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const execute = addRelatedTopicTool.function(user, 'rss_feed_item', item.id)

    const result = await execute({
      topic_id: topic.id,
    })

    expect(result.success).toBe(true)
    expect(result.topic_id).toBe(topic.id)
    expect(result.topic_name).toBe(topic.name)

    const rows = (await getEntityRelation(
      'relation__rss_feed_item__category__topic',
      item.id,
      topic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows).toHaveLength(1)
    expect(rows[0].deleted_at).toBeNull()
  })

  it('rejects rss-feed-item-topic relation for normal users', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const execute = addRelatedTopicTool.function(user, 'rss_feed_item', item.id)

    await expect(execute({ topic_id: topic.id })).rejects.toMatchObject({ status: 403 })

    const rows = await getEntityRelation(
      'relation__rss_feed_item__category__topic',
      item.id,
      topic.id,
    )
    expect(rows).toHaveLength(0)
  })

  it('allows the autotagger agent to create rss-feed-item-topic relations', async () => {
    await setupTestAutotaggerAgent()
    const autotagger = await getPrivateUserByAny('autotagger')
    expect(autotagger?.is_agent).toBe(true)
    const creator = await createTestUser()
    const topic = await createTestTopic({ user: creator })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const execute = addRelatedTopicTool.function(autotagger!, 'rss_feed_item', item.id)

    const result = await execute({ topic_id: topic.id })

    expect(result.success).toBe(true)
    const rows = await getEntityRelation(
      'relation__rss_feed_item__category__topic',
      item.id,
      topic.id,
    )
    expect(rows).toHaveLength(1)
  })

  it('rejects unsupported entity types without falling through to RSS feed items', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user })
    const execute = addRelatedTopicTool.function(user, 'comment' as never, randomUUID())

    await expect(execute({ topic_id: topic.id })).rejects.toThrow('Unsupported entity type')
  })
})
