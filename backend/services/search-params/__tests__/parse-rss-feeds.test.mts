import { it, expect, describe, vi } from 'vitest'
import { getTopicIdByAnyCached, getTopicIdsByAnyCachedBatch } from '@services/entity-cache'
import { parseRssFeedsSearchParams } from '../parse-rss-feeds.mts'

describe('parse-rss-feeds', () => {
  const resolveHashtagTopicSearch = vi.fn<VitestLooseMock>()

  it('resolves #slug token in q into hashtag_topic_ids and strips it from text_search_query', async () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    resolveHashtagTopicSearch.mockResolvedValue({
      filters: [{ kind: 'linked_topic', topicId: uuid }],
      hasUnknown: false,
      topicIds: [uuid],
      textSearchQuery: 'foo',
    })

    const { searchOptions } = await parseRssFeedsSearchParams(
      { q: 'foo #ai' },
      { resolveHashtagTopicSearch },
    )

    expect(searchOptions.hashtag_topic_ids).toEqual([uuid])
    expect(searchOptions.text_search_query).toBe('foo')
  })

  it('keeps multiple resolved hashtags as independent topic constraints', async () => {
    const uuidOne = 'aaaaaaaa-0000-0000-0000-000000000001'
    const uuidTwo = 'bbbbbbbb-0000-0000-0000-000000000002'
    resolveHashtagTopicSearch.mockResolvedValue({
      filters: [
        { kind: 'linked_topic', topicId: uuidOne },
        { kind: 'linked_topic', topicId: uuidTwo },
      ],
      hasUnknown: false,
      topicIds: [uuidOne, uuidTwo],
      textSearchQuery: undefined,
    })

    const { searchOptions } = await parseRssFeedsSearchParams(
      { q: '#topic-one #topic-two' },
      { resolveHashtagTopicSearch },
    )

    expect(searchOptions.hashtag_topic_ids).toEqual([uuidOne, uuidTwo])
    expect(searchOptions.topic_match).toBeUndefined()
    expect(searchOptions.text_search_query).toBeUndefined()
  })

  it('keeps a singular topic filter and resolved hashtag as intersecting constraints', async () => {
    const singularTopicId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const hashtagTopicId = 'bbbbbbbb-0000-0000-0000-000000000002'
    resolveHashtagTopicSearch.mockResolvedValue({
      filters: [{ kind: 'linked_topic', topicId: hashtagTopicId }],
      hasUnknown: false,
      topicIds: [hashtagTopicId],
      textSearchQuery: undefined,
    })

    const { searchOptions } = await parseRssFeedsSearchParams(
      { q: '#hashtag-topic', topic: 'singular-topic' },
      {
        getTopicIdByAnyCached: vi
          .fn<typeof getTopicIdByAnyCached>()
          .mockResolvedValue(singularTopicId),
        getTopicIdsByAnyCachedBatch: vi
          .fn<typeof getTopicIdsByAnyCachedBatch>()
          .mockResolvedValue([]),
        resolveHashtagTopicSearch,
      },
    )

    expect(searchOptions).toMatchObject({
      topic_id: singularTopicId,
      hashtag_topic_ids: [hashtagTopicId],
    })
  })

  it('keeps plural topics and resolved hashtags as independent filters', async () => {
    const topicId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const hashtagTopicId = 'bbbbbbbb-0000-0000-0000-000000000002'
    resolveHashtagTopicSearch.mockResolvedValue({
      filters: [{ kind: 'linked_topic', topicId: hashtagTopicId }],
      hasUnknown: false,
      topicIds: [hashtagTopicId],
      textSearchQuery: undefined,
    })

    const { searchOptions } = await parseRssFeedsSearchParams(
      { q: '#hashtag-topic', topics: ['plural-topic'] },
      {
        getTopicIdsByAnyCachedBatch: vi
          .fn<typeof getTopicIdsByAnyCachedBatch>()
          .mockResolvedValue([topicId]),
        resolveHashtagTopicSearch,
      },
    )

    expect(searchOptions).toMatchObject({
      topic_ids: [topicId],
      hashtag_topic_ids: [hashtagTopicId],
    })
    expect(searchOptions.topic_match).toBeUndefined()
  })

  it('returns an empty result for an unknown or unlinked hashtag', async () => {
    resolveHashtagTopicSearch.mockResolvedValue({
      filters: [{ kind: 'exact_alias', aliasId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }],
      hasUnknown: false,
      topicIds: [],
      textSearchQuery: 'news',
    })

    await expect(
      parseRssFeedsSearchParams({ q: 'news #unlinked' }, { resolveHashtagTopicSearch }),
    ).resolves.toMatchObject({ shouldReturnEmpty: true })

    resolveHashtagTopicSearch.mockResolvedValue({
      filters: [],
      hasUnknown: true,
      topicIds: [],
      textSearchQuery: 'news',
    })
    await expect(
      parseRssFeedsSearchParams({ q: 'news #missing' }, { resolveHashtagTopicSearch }),
    ).resolves.toMatchObject({ shouldReturnEmpty: true })
  })

  it('narrows valid feed types and rejects unsupported string values', async () => {
    resolveHashtagTopicSearch.mockResolvedValue({
      filters: [],
      hasUnknown: false,
      topicIds: [],
      textSearchQuery: undefined,
    })

    const validResult = await parseRssFeedsSearchParams(
      { feed_type: 'podcast' },
      { resolveHashtagTopicSearch },
    )
    const invalidResult = await parseRssFeedsSearchParams(
      { feed_type: 'newsletter' },
      { resolveHashtagTopicSearch },
    )

    expect(validResult.searchOptions.feed_type).toBe('podcast')
    expect(invalidResult).toEqual({ shouldReturnEmpty: true, searchOptions: {} })
  })
})
