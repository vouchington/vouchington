import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  getTopicAliasIdForTest,
  insertTestTopic,
  insertTopicAliasForTest,
  insertUnlinkedTopicAliasForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { parsePostsSearchParams } from '../parse-posts.mts'

describe('parse-posts', () => {
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
    expect(searchOptions.universal_topic_ids).toEqual([topicId])
    expect(searchOptions).not.toHaveProperty('hashtag_topic_ids')
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
    expect(searchOptions).not.toHaveProperty('hashtag_topic_ids')
  })

  it('prefers a linked alias over a colliding active topic slug', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)
    const slug = `collision-${random}`
    const aliasTopicId = await insertTestTopic({
      name: `Alias ${random}`,
      slug: `alias-topic-${random}`,
      createdById: user.id,
    })
    await insertTestTopic({ name: `Slug ${random}`, slug, createdById: user.id })
    await insertTopicAliasForTest(aliasTopicId, slug)
    const { searchOptions } = await parsePostsSearchParams({ q: `#${slug}` })
    expect(searchOptions.universal_topic_ids).toEqual([aliasTopicId])
  })

  it('prefers an active topic slug over a colliding unlinked alias', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)
    const slug = `unlinked-collision-${random}`
    const topicId = await insertTestTopic({ name: `Slug ${random}`, slug, createdById: user.id })
    await insertUnlinkedTopicAliasForTest(slug)
    const { searchOptions } = await parsePostsSearchParams({ q: `#${slug}` })
    expect(searchOptions.universal_topic_ids).toEqual([topicId])
    expect(searchOptions.hashtag_alias_ids).toBeUndefined()
  })

  it('parsePostsSearchParams returns an empty result for an unknown valid hashtag', async () => {
    await expect(
      parsePostsSearchParams({ q: 'text #missing-topic-for-search' }),
    ).resolves.toMatchObject({
      shouldReturnEmpty: true,
    })
  })

  it.each([
    'Read #caf\u00e9 before subscribing',
    'Read #cafe\u0301 before subscribing',
    'Read #cafe\u093e before subscribing',
    'Read #cafe\u20dd before subscribing',
  ])(
    'keeps a malformed Unicode hashtag in the text query instead of truncating it: %s',
    async query => {
      const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({ q: query })

      expect(shouldReturnEmpty).toBe(false)
      expect(searchOptions.text_search_query).toBe(query)
      expect(searchOptions).not.toHaveProperty('hashtag_topic_ids')
      expect(searchOptions.hashtag_alias_ids).toBeUndefined()
    },
  )

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
    expect(searchOptions).not.toHaveProperty('hashtag_topic_ids')
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
    expect(searchOptions.universal_topic_ids).toEqual([topicId])
  })

  it('rejects six raw hashtag mentions before deduplication', async () => {
    const hashtags = Array.from({ length: 6 }, () => '#same-topic').join(' ')

    await expect(parsePostsSearchParams({ q: hashtags })).rejects.toMatchObject({
      status: 400,
      message: 'Too many hashtag topic identifiers (max 5)',
    })
  })

  it('deduplicates four linked hashtags against an explicit topic', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)
    const slug = `parse-posts-linked-${random}`
    const alias = `parse-posts-alias-${random}`
    const topicId = await insertTestTopic({ name: `Linked ${random}`, slug, createdById: user.id })
    await insertTopicAliasForTest(topicId, alias)
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      topic: slug,
      q: Array.from({ length: 4 }, () => `#${alias}`).join(' '),
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.universal_topic_ids).toEqual([topicId])
    expect(searchOptions).not.toHaveProperty('hashtag_topic_ids')
    expect(searchOptions.hashtag_alias_ids).toBeUndefined()
  })

  it('keeps distinct topic terms and an unlinked hashtag as independent filters', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)
    const firstSlug = `parse-first-${random}`
    const secondSlug = `parse-second-${random}`
    const unlinked = `parse-unlinked-${random}`
    const first = await insertTestTopic({
      name: `First ${random}`,
      slug: firstSlug,
      createdById: user.id,
    })
    const second = await insertTestTopic({
      name: `Second ${random}`,
      slug: secondSlug,
      createdById: user.id,
    })
    await insertUnlinkedTopicAliasForTest(unlinked)
    const aliasId = await getTopicAliasIdForTest(unlinked)
    const { searchOptions } = await parsePostsSearchParams({
      topic: firstSlug,
      q: `#${secondSlug} #${unlinked}`,
    })
    expect(searchOptions.universal_topic_ids).toEqual([first, second])
    expect(searchOptions.hashtag_alias_ids).toEqual([aliasId])
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

  it('rejects six topic identifiers before resolving them', async () => {
    const slugs = Array.from({ length: 6 }, (_, i) => `topic-${i}`).join(',')
    await expect(parsePostsSearchParams({ topic: slugs })).rejects.toMatchObject({
      status: 400,
      message: 'Too many topic identifiers (max 5)',
    })
  })

  it('parsePostsSearchParams parses drafts booleanish', async () => {
    const { searchOptions } = await parsePostsSearchParams({ drafts: '1' })
    expect(searchOptions.drafts).toBe(true)
  })

  it('parsePostsSearchParams throws 422 for invalid similar_rss_feed_item format', async () => {
    await expect(
      parsePostsSearchParams({ similar_rss_feed_item: 'not-valid' }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
