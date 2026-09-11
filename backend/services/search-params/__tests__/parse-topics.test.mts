import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTopicAliasForTest,
} from '@voucha/test-helpers'
import { parseTopicsSearchParams } from '../parse-topics.mts'

describe('parse-topics', () => {
  it('does not expose the internal omitLimit option through query parameters', async () => {
    const { searchOptions } = await parseTopicsSearchParams({ omitLimit: 'true' })
    expect(searchOptions).not.toHaveProperty('omitLimit')
  })

  it('parseTopicsSearchParams returns defaults for empty query', async () => {
    const { shouldReturnEmpty, searchOptions } = await parseTopicsSearchParams({})
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.limit).toBe(25)
  })

  it('parseTopicsSearchParams maps q to text_search_query when not set', async () => {
    const { searchOptions } = await parseTopicsSearchParams({ q: 'my search' })
    expect(searchOptions.text_search_query).toBe('my search')
  })

  it('parseTopicsSearchParams does not overwrite text_search_query with q', async () => {
    const { searchOptions } = await parseTopicsSearchParams({
      q: 'my search',
      text_search_query: 'explicit query',
    })
    expect(searchOptions.text_search_query).toBe('explicit query')
  })

  it('parseTopicsSearchParams shouldReturnEmpty=true when similar_post not found', async () => {
    const { shouldReturnEmpty } = await parseTopicsSearchParams({
      similar_post: 'nonexistent-post-slug-xyz',
    })
    expect(shouldReturnEmpty).toBe(true)
  })

  it('parseTopicsSearchParams shouldReturnEmpty=true when similar_topic not found', async () => {
    const { shouldReturnEmpty } = await parseTopicsSearchParams({
      similar_topic: 'nonexistent-topic-slug-xyz',
    })
    expect(shouldReturnEmpty).toBe(true)
  })

  it('parseTopicsSearchParams resolves real similar_topic', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Parse Topics Similar ${random}`,
      slug: `parse-topics-similar-${random}`,
      createdById: user!.id,
    })
    const { shouldReturnEmpty, searchOptions } = await parseTopicsSearchParams({
      similar_topic: `parse-topics-similar-${random}`,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.similar_topic_id).toBe(topicId)
  })

  it('parseTopicsSearchParams resolves real similar_post', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const postId = await insertTestPost({
      createdById: user!.id,
      slug: `parse-topics-post-${random}`,
      title: `Parse Topics Post ${random}`,
      markdown: 'test',
    })
    const { shouldReturnEmpty, searchOptions } = await parseTopicsSearchParams({
      similar_post: `parse-topics-post-${random}`,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.similar_post_id).toBe(postId)
  })

  it('parseTopicsSearchParams throws 422 for invalid similar_rss_feed_item format', async () => {
    await expect(
      parseTopicsSearchParams({ similar_rss_feed_item: 'bad-format' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('parseTopicsSearchParams parses spending_category booleanish', async () => {
    const { searchOptions } = await parseTopicsSearchParams({ spending_category: '1' })
    expect(searchOptions.spending_category).toBe(true)
  })

  it('parseTopicsSearchParams parses rss_feed booleanish', async () => {
    const { searchOptions } = await parseTopicsSearchParams({ rss_feed: '0' })
    expect(searchOptions.rss_feed).toBe(false)
  })

  it('parseTopicsSearchParams resolves #topic in q and strips it from text search', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Parse Topics Hash ${random}`,
      slug: `parse-topics-hash-${random}`,
      createdById: user!.id,
    })
    await insertTopicAliasForTest(topicId, `parse-topics-hash-${random}`)
    const { searchOptions } = await parseTopicsSearchParams({
      q: `#parse-topics-hash-${random}`,
    })
    expect(searchOptions.hashtag_topic_ids).toEqual([topicId])
    expect(searchOptions.text_search_query).toBeUndefined()
  })

  it('parseTopicsSearchParams returns an empty result for an unknown valid hashtag', async () => {
    await expect(
      parseTopicsSearchParams({ q: '#nonexistent-topic-xyz123' }),
    ).resolves.toMatchObject({
      shouldReturnEmpty: true,
    })
  })
})
