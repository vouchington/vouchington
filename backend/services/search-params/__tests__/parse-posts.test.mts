import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  getTopicAliasIdForTest,
  insertTestTopic,
  insertTopicAliasForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { parsePostsSearchParams } from '../parse-posts.mts'

describe('parse-posts', () => {
  it('parsePostsSearchParams returns defaults for empty query', async () => {
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({})
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.limit).toBe(25)
  })

  it('parsePostsSearchParams shouldReturnEmpty=false when no identifiers provided', async () => {
    const { shouldReturnEmpty } = await parsePostsSearchParams({ limit: '10' })
    expect(shouldReturnEmpty).toBe(false)
  })

  it('parsePostsSearchParams shouldReturnEmpty=true when topic slug not found', async () => {
    const { shouldReturnEmpty } = await parsePostsSearchParams({
      topic: 'nonexistent-topic-slug-xyz',
    })
    expect(shouldReturnEmpty).toBe(true)
  })

  it('parsePostsSearchParams resolves real topic ID via topics= (universal)', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Parse Posts Test Topic ${random}`,
      slug: `parse-posts-topic-${random}`,
      createdById: user!.id,
    })
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      topic: `parse-posts-topic-${random}`,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.universal_topic_ids).toEqual([topicId])
  })

  it('parsePostsSearchParams resolves #topic in q and strips it from text search', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Parse Posts Hash Topic ${random}`,
      slug: `parse-posts-hash-${random}`,
      createdById: user!.id,
    })
    await insertTopicAliasForTest(topicId, `parse-posts-hash-${random}`)
    const { searchOptions } = await parsePostsSearchParams({
      q: `cashback #parse-posts-hash-${random}`,
    })
    expect(searchOptions.text_search_query).toBe('cashback')
    expect(searchOptions.hashtag_topic_ids).toEqual([topicId])
    expect(searchOptions.universal_topic_ids).toBeUndefined()
  })

  it('treats an alias owned by a deleted topic as an exact hashtag alias', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const alias = `deleted-hashtag-owner-${random}`
    const topicId = await insertTestTopic({
      name: `Deleted hashtag owner ${random}`,
      slug: `deleted-hashtag-topic-${random}`,
      createdById: user!.id,
    })
    await insertTopicAliasForTest(topicId, alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    await softDeleteTopic(topicId, user!.id)

    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      q: `cashback #${alias}`,
    })

    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.text_search_query).toBe('cashback')
    expect(searchOptions.hashtag_alias_ids).toEqual([aliasId])
    expect(searchOptions.hashtag_topic_ids).toBeUndefined()
  })

  it('parsePostsSearchParams returns an empty result for an unknown valid hashtag', async () => {
    await expect(
      parsePostsSearchParams({ q: 'text #missing-topic-for-search' }),
    ).resolves.toMatchObject({
      shouldReturnEmpty: true,
    })
  })

  it('keeps a malformed Unicode hashtag in the text query instead of truncating it', async () => {
    const query = 'Read #caf\u00e9 before subscribing'

    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({ q: query })

    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.text_search_query).toBe(query)
    expect(searchOptions.hashtag_topic_ids).toBeUndefined()
    expect(searchOptions.hashtag_alias_ids).toBeUndefined()
  })

  it.each([
    'Read https://example.test/#pricing before subscribing',
    'Read https://example.test?plan=#pricing before subscribing',
    'Read www.example.test/#pricing before subscribing',
    'Read /docs/#pricing before subscribing',
    'Read https://en.wikipedia.org/wiki/Foo_(bar)#History before subscribing',
    'Read /docs/(v2_(legacy))#History before subscribing',
  ])('keeps URL fragments in q out of hashtag topic resolution: %s', async query => {
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({ q: query })

    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.text_search_query).toBe(query)
    expect(searchOptions.hashtag_topic_ids).toBeUndefined()
    expect(searchOptions.hashtag_alias_ids).toBeUndefined()
  })

  it('separates a real hashtag filter from a URL fragment', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const slug = `mixed-url-hashtag-${random}`
    const topicId = await insertTestTopic({
      name: `Mixed URL hashtag ${random}`,
      slug,
      createdById: user!.id,
    })
    const url = 'https://example.test?plan=#pricing'

    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      q: `Read 🚀 #${slug} at ${url}`,
    })

    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.text_search_query).toBe(`Read 🚀 at ${url}`)
    expect(searchOptions.hashtag_topic_ids).toEqual([topicId])
  })

  it('parsePostsSearchParams throws 422 for too many hashtag topic identifiers', async () => {
    const hashtags = Array.from({ length: 11 }, (_, i) => `#topic-${i}`).join(' ')

    await expect(parsePostsSearchParams({ q: hashtags })).rejects.toMatchObject({
      status: 422,
      message: 'Too many hashtag topic identifiers (max 10)',
    })
  })

  it('parsePostsSearchParams deduplicates topic identifiers (universal)', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Parse Posts Dedup Topic ${random}`,
      slug: `parse-posts-dedup-${random}`,
      createdById: user!.id,
    })
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      topic: `parse-posts-dedup-${random}`,
      topics: `parse-posts-dedup-${random}`,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.universal_topic_ids).toEqual([topicId])
  })

  it('parsePostsSearchParams resolves categories= to related_topic_ids', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Parse Posts Cat Topic ${random}`,
      slug: `parse-posts-cat-${random}`,
      createdById: user!.id,
    })
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      categories: `parse-posts-cat-${random}`,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.related_topic_ids).toEqual([topicId])
  })

  it('parsePostsSearchParams resolves data_point_topic to data_point_topic_ids', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Parse Posts DP Topic ${random}`,
      slug: `parse-posts-dp-${random}`,
      createdById: user!.id,
    })
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      data_point_topic: `parse-posts-dp-${random}`,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.data_point_topic_ids).toEqual([topicId])
  })

  it('parsePostsSearchParams throws 422 when too many topic identifiers', async () => {
    const slugs = Array.from({ length: 11 }, (_, i) => `topic-${i}`).join(',')
    await expect(parsePostsSearchParams({ topic: slugs })).rejects.toMatchObject({ status: 422 })
  })

  it('parsePostsSearchParams parses drafts booleanish', async () => {
    const { searchOptions } = await parsePostsSearchParams({ drafts: '1' })
    expect(searchOptions.drafts).toBe(true)
  })

  it('parsePostsSearchParams ignores the internal omitLimit option', async () => {
    const { searchOptions } = await parsePostsSearchParams({ omitLimit: 'true' })
    expect(searchOptions).not.toHaveProperty('omitLimit')
  })

  it('parsePostsSearchParams throws 422 for invalid similar_rss_feed_item format', async () => {
    await expect(
      parsePostsSearchParams({ similar_rss_feed_item: 'not-valid' }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
