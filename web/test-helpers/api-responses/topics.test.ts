import { describe, expect, it } from 'vitest'
import { makeTopic, makeTopicMutationResponse, makeTopicsSearchResponse } from './topics'
import type { TopicsResponseBody } from '@/types/api-responses'
import type { Topic } from '@/types/topics'

describe('topic API response factories', () => {
  it('builds a default serialized topic entity', () => {
    const topic: Topic = makeTopic()

    expect(topic).toMatchObject({
      __entity_type: 'topic',
      id: 'topic-1',
      name: 'Test Topic',
      slug: 'test-topic',
      topic_type: 'topic',
      noindex: false,
      allow_reviews: true,
      created_at: '2026-01-01T00:00:00Z',
      created_by: { id: 'user-1', username: 'testuser' },
      updated_by: { id: 'user-1', username: 'testuser' },
    })
  })

  it('applies topic overrides without dropping required fields', () => {
    const topic = makeTopic({
      id: 'source-1',
      name: 'dev.to',
      slug: 'dev.to',
      topic_type: 'rss_feed',
      hostname_id: null,
    })

    expect(topic).toMatchObject({
      id: 'source-1',
      name: 'dev.to',
      slug: 'dev.to',
      topic_type: 'rss_feed',
      hostname_id: null,
      markdown: '',
      aliases: [],
    })
  })

  it('builds a search response with derived result refs and topic maps', () => {
    const topic = makeTopic({ id: 'topic-2', name: 'Security', slug: 'security' })
    const topicsMetrics = {
      'topic-2': {
        __entity_type: 'topic_metrics',
        id: 'topic-2',
        count: {
          discussions: 1,
          reviews: 2,
          'data-points': 3,
          news: 4,
          latest: 5,
        },
        ratings: {
          count: {
            '1': 0,
            '2': 0,
            '3': 1,
            '4': 1,
            '5': 1,
          },
        },
        ratings__updated_at: '2026-01-01T00:00:00Z',
        bookmarks: {
          follow: 3,
        },
        bookmarks__updated_at: '2026-01-01T00:00:00Z',
      },
    } satisfies TopicsResponseBody['topics_metrics']

    const response = makeTopicsSearchResponse({ topics: [topic], topicsMetrics })

    expect(response.results).toEqual([
      {
        __entity_type: 'topic',
        id: 'topic-2',
        name: 'Security',
        slug: 'security',
        topic_type: 'topic',
      },
    ])
    expect(response.topics).toEqual({ 'topic-2': topic })
    expect(response.topics_metrics).toEqual(topicsMetrics)
    expect(response.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('builds topic mutation responses from a supplied topic', () => {
    const topic = makeTopic({ id: 'topic-3' })

    expect(makeTopicMutationResponse({ topic })).toEqual({ topic })
  })
})
