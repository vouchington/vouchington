import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertUnlinkedTopicAliasForTest,
} from '@voucha/test-helpers'
import { parseRssFeedsSearchParams } from '../parse-rss-feeds.mts'

async function insertSlugTopic(label: string) {
  const user = await createTestUser({ administrator: true })
  const slug = `rss-feeds-${label}-${crypto.randomUUID().slice(0, 8)}`
  const topicId = await insertTestTopic({ name: `RSS feeds ${slug}`, slug, createdById: user!.id })
  return { slug, topicId }
}

describe('parse-rss-feeds', () => {
  it('resolves #slug token in q into hashtag_topic_ids and strips it from text_search_query', async () => {
    const { slug, topicId } = await insertSlugTopic('hashtag')

    const { searchOptions } = await parseRssFeedsSearchParams({ q: `foo #${slug}` })

    expect(searchOptions.hashtag_topic_ids).toEqual([topicId])
    expect(searchOptions.text_search_query).toBe('foo')
  })

  it('keeps multiple resolved hashtags as independent topic constraints', async () => {
    const first = await insertSlugTopic('hashtag-one')
    const second = await insertSlugTopic('hashtag-two')

    const { searchOptions } = await parseRssFeedsSearchParams({
      q: `#${first.slug} #${second.slug}`,
    })

    expect(searchOptions.hashtag_topic_ids).toEqual([first.topicId, second.topicId])
    expect(searchOptions.topic_match).toBeUndefined()
    expect(searchOptions.text_search_query).toBeUndefined()
  })

  it('keeps a singular topic filter and resolved hashtag as intersecting constraints', async () => {
    const singular = await insertSlugTopic('singular')
    const hashtag = await insertSlugTopic('hashtag')

    const { searchOptions } = await parseRssFeedsSearchParams({
      q: `#${hashtag.slug}`,
      topic: singular.slug,
    })

    expect(searchOptions).toMatchObject({
      topic_id: singular.topicId,
      hashtag_topic_ids: [hashtag.topicId],
    })
  })

  it('keeps plural topics and resolved hashtags as independent filters', async () => {
    const plural = await insertSlugTopic('plural')
    const hashtag = await insertSlugTopic('hashtag')

    const { searchOptions } = await parseRssFeedsSearchParams({
      q: `#${hashtag.slug}`,
      topics: [plural.slug],
    })

    expect(searchOptions).toMatchObject({
      topic_ids: [plural.topicId],
      hashtag_topic_ids: [hashtag.topicId],
    })
    expect(searchOptions.topic_match).toBeUndefined()
  })

  it('includes only resolved plural publisher type ids', async () => {
    const publisherType = await insertSlugTopic('publisher-type')

    const { shouldReturnEmpty, searchOptions } = await parseRssFeedsSearchParams({
      publisher_types: [publisherType.slug],
    })

    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.publisher_type_ids).toEqual([publisherType.topicId])
  })

  it('omits the plural publisher type filter when no identifiers resolve', async () => {
    const { shouldReturnEmpty, searchOptions } = await parseRssFeedsSearchParams({
      publisher_types: [`rss-feeds-missing-type-${crypto.randomUUID().slice(0, 8)}`],
    })

    expect(shouldReturnEmpty).toBe(true)
    expect(searchOptions).not.toHaveProperty('publisher_type_ids')
  })

  it('returns an empty result for an unknown or unlinked hashtag', async () => {
    const unlinkedSlug = `rss-feeds-unlinked-${crypto.randomUUID().slice(0, 8)}`
    await insertUnlinkedTopicAliasForTest(unlinkedSlug)

    await expect(parseRssFeedsSearchParams({ q: `news #${unlinkedSlug}` })).resolves.toMatchObject({
      shouldReturnEmpty: true,
    })
    await expect(
      parseRssFeedsSearchParams({
        q: `news #rss-feeds-missing-${crypto.randomUUID().slice(0, 8)}`,
      }),
    ).resolves.toMatchObject({ shouldReturnEmpty: true })
  })

  it('narrows valid feed types and rejects unsupported string values', async () => {
    const validResult = await parseRssFeedsSearchParams({ feed_type: 'podcast' })
    const invalidResult = await parseRssFeedsSearchParams({ feed_type: 'newsletter' })

    expect(validResult.searchOptions.feed_type).toBe('podcast')
    expect(invalidResult).toEqual({ shouldReturnEmpty: true, searchOptions: {} })
  })
})
