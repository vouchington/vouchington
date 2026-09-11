import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  insertTopicAliasForTest,
  insertUnlinkedTopicAliasForTest,
} from '@voucha/test-helpers'
import { parseRssFeedItemsSearchParams } from '../parse-rss-feed-items.mts'

describe('parse-rss-feed-items', () => {
  it('parseRssFeedItemsSearchParams returns defaults for empty query', async () => {
    const { shouldReturnEmpty, searchOptions } = await parseRssFeedItemsSearchParams({})
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.limit).toBe(10)
  })

  it('parseRssFeedItemsSearchParams shouldReturnEmpty=true when topic not found', async () => {
    const { shouldReturnEmpty } = await parseRssFeedItemsSearchParams({
      topic: 'nonexistent-topic-slug-xyz',
    })
    expect(shouldReturnEmpty).toBe(true)
  })

  it('parseRssFeedItemsSearchParams shouldReturnEmpty=false when topic found', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `RSS Feed Items Topic ${random}`,
      slug: `rss-feed-items-topic-${random}`,
      createdById: user!.id,
    })
    const { shouldReturnEmpty, searchOptions } = await parseRssFeedItemsSearchParams({
      topic: `rss-feed-items-topic-${random}`,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.topic_ids).toEqual([topicId])
  })

  it('parseRssFeedItemsSearchParams resolves #topic in q and strips it from text search', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `RSS Feed Items Hash Topic ${random}`,
      slug: `rss-feed-items-hash-${random}`,
      createdById: user!.id,
    })
    const { searchOptions } = await parseRssFeedItemsSearchParams({
      q: `award availability #rss-feed-items-hash-${random}`,
    })
    expect(searchOptions.text_search_query).toBe('award availability')
    expect(searchOptions.hashtag_topic_ids).toEqual([topicId])
    expect(searchOptions.topic_ids).toBeUndefined()
  })

  it('trims terminal hashtag separators while preserving internal separators', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const alias = `rss.feed_items_${random}`
    const canonical = `rss-feed-items-${random}`
    const topicId = await insertTestTopic({
      name: `RSS terminal separator ${random}`,
      slug: `rss-terminal-separator-${random}`,
      createdById: user!.id,
    })
    await insertTopicAliasForTest(topicId, canonical)

    const { searchOptions } = await parseRssFeedItemsSearchParams({
      q: `posts about #${alias}.`,
    })

    expect(searchOptions.text_search_query).toBe('posts about')
    expect(searchOptions.hashtag_topic_ids).toEqual([topicId])
  })

  it('prefers an active alias-less source topic slug over a colliding unlinked hashtag alias', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const slug = `rss-source-hashtag-collision-${random}`
    await insertUnlinkedTopicAliasForTest(slug)
    const topicId = await insertTestTopic({
      name: `RSS source hashtag collision ${random}`,
      slug,
      createdById: user!.id,
      topicType: 'rss_feed',
    })

    const { shouldReturnEmpty, searchOptions } = await parseRssFeedItemsSearchParams({
      q: `award availability #${slug}`,
    })

    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.text_search_query).toBe('award availability')
    expect(searchOptions.hashtag_topic_ids).toEqual([topicId])
    expect(searchOptions.hashtag_alias_ids).toBeUndefined()
  })

  it('preserves an active linked alias over a colliding source topic slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const slug = `rss-source-linked-alias-${random}`
    const directTopicId = await insertTestTopic({
      name: `RSS source direct topic ${random}`,
      slug,
      createdById: user!.id,
      topicType: 'rss_feed',
    })
    const aliasTopicId = await insertTestTopic({
      name: `RSS source alias topic ${random}`,
      slug: `rss-source-alias-owner-${random}`,
      createdById: user!.id,
      topicType: 'rss_feed',
    })
    await insertTopicAliasForTest(aliasTopicId, slug)

    const { searchOptions } = await parseRssFeedItemsSearchParams({ q: `#${slug}` })

    expect(directTopicId).not.toBe(aliasTopicId)
    expect(searchOptions.hashtag_topic_ids).toEqual([aliasTopicId])
  })

  it('parseRssFeedItemsSearchParams returns an empty result for an unknown valid hashtag', async () => {
    await expect(
      parseRssFeedItemsSearchParams({ q: 'news #missing-rss-topic-for-search' }),
    ).resolves.toMatchObject({
      shouldReturnEmpty: true,
    })
  })

  it('parseRssFeedItemsSearchParams throws 422 for non-UUID rss_feed', async () => {
    await expect(parseRssFeedItemsSearchParams({ rss_feed: 'not-a-uuid' })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('parseRssFeedItemsSearchParams throws 422 for too many topics', async () => {
    const slugs = Array.from({ length: 11 }, (_, i) => `topic-${i}`).join(',')
    await expect(parseRssFeedItemsSearchParams({ topic: slugs })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('parseRssFeedItemsSearchParams resolves valid UUID rss_feed', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `RSS Feed Items Feed Topic ${random}`,
      slug: `rss-feed-items-feed-topic-${random}`,
      createdById: user!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `RSS Feed Items Feed ${random}`,
    })
    const { shouldReturnEmpty, searchOptions } = await parseRssFeedItemsSearchParams({
      rss_feed: feedId,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.rss_feed_ids).toEqual([feedId])
  })

  it('parseRssFeedItemsSearchParams ignores out-of-range similar_window_days', async () => {
    const { searchOptions } = await parseRssFeedItemsSearchParams({ similar_window_days: '999' })
    expect(searchOptions.similar_window_days).toBeUndefined()
  })

  it('parseRssFeedItemsSearchParams accepts valid similar_window_days', async () => {
    const { searchOptions } = await parseRssFeedItemsSearchParams({ similar_window_days: '30' })
    expect(searchOptions.similar_window_days).toBe(30)
  })

  it('parseRssFeedItemsSearchParams similar_window_days=0 is valid', async () => {
    const { searchOptions } = await parseRssFeedItemsSearchParams({ similar_window_days: '0' })
    expect(searchOptions.similar_window_days).toBe(0)
  })

  it('parseRssFeedItemsSearchParams parses read=true', async () => {
    const { searchOptions } = await parseRssFeedItemsSearchParams({ read: 'true' })
    expect(searchOptions.read).toBe(true)
  })

  it('parseRssFeedItemsSearchParams parses read=false', async () => {
    const { searchOptions } = await parseRssFeedItemsSearchParams({ read: 'false' })
    expect(searchOptions.read).toBe(false)
  })

  it('parseRssFeedItemsSearchParams ignores unknown read value', async () => {
    const { searchOptions } = await parseRssFeedItemsSearchParams({ read: 'maybe' })
    expect(searchOptions.read).toBeUndefined()
  })
})
