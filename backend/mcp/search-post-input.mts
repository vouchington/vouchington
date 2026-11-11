import type { PagedSearchArgs } from './paged-search.mts'
import { CREDIT_CARD_RESULTS, CREDIT_SCORE_RANGES } from '@ts-shared/data-points'
import { MAX_TOPIC_SEARCH_TERMS } from '@services/search-params'
import type { PostSearchSort } from '@services/posts/search/types'
import { topicReferenceSchema, userReferenceSchema } from './entity-reference-schema.mts'
import { VALID_SEARCH_POST_TYPES, type SearchPostType } from '@ts-shared/feed-capabilities'

export const POST_SORTS = [
  'new',
  'best',
  'hot',
  'trending',
  'relevance',
  'following_new',
] as const satisfies readonly PostSearchSort[]

/** The `time_range` option shared by general post search and community post listing tools. */
export const postTimeRangeSchema = {
  type: 'string',
  enum: ['1d', '1w', '1m', '1y', 'all'],
  description:
    'Post search: omit for no age filter. An explicit code, including 1m, is strict. Community lists default to 1m.',
} as const

/** Public REST post search filters, plus the existing singular post-type convenience. */
export function postSearchFilterSchemaProperties() {
  return {
    sort: {
      type: 'string',
      enum: [...POST_SORTS],
      description:
        'Sort by new, best, hot, trending, relevance, or following_new. Hot and trending use a stable age-weighted rank. Keyword relevance orders by ranking score, then id.',
    },
    post_type: {
      type: 'string',
      enum: [...VALID_SEARCH_POST_TYPES],
    },
    post_types: {
      type: 'array',
      items: { type: 'string', enum: [...VALID_SEARCH_POST_TYPES] },
    },
    categories: {
      type: 'array',
      maxItems: MAX_TOPIC_SEARCH_TERMS,
      items: { type: 'string' },
      description: 'Match all categories; five maximum including category.',
    },
    category: { type: 'string' },
    creator: userReferenceSchema,
    community_id: { type: 'string', format: 'uuid' },
    trending_min_score: {
      type: 'number',
      minimum: 0,
      description: 'Minimum age-decayed score for trending.',
    },
    data_point_topic: topicReferenceSchema,
    data_point_vertical: { type: 'string' },
    data_point_result: { type: 'string', enum: CREDIT_CARD_RESULTS.map(option => option.value) },
    data_point_credit_score_range: {
      type: 'string',
      enum: CREDIT_SCORE_RANGES.map(option => option.value),
    },
    review_topic: topicReferenceSchema,
    story_id: { type: 'string', format: 'uuid' },
    topic_recommendation_status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
    has_hacker_news_references: {
      type: 'boolean',
      description:
        'Only items whose URL is seen or mentioned on Hacker News (true) or not (false).',
    },
    time_range: postTimeRangeSchema,
    topic: topicReferenceSchema,
    topics: {
      type: 'array',
      maxItems: MAX_TOPIC_SEARCH_TERMS,
      items: topicReferenceSchema,
      description: 'Match all topics; five topic and hashtag terms maximum.',
    },
    url: {
      anyOf: [
        { type: 'string', format: 'uuid' },
        { type: 'string', format: 'uri' },
      ],
    },
  }
}

export type SearchPostArgs = PagedSearchArgs & {
  sort?: (typeof POST_SORTS)[number]
  post_type?: SearchPostType
  post_types?: SearchPostType[]
  categories?: string[]
  category?: string
  creator?: string
  community_id?: string
  trending_min_score?: number
  data_point_topic?: string
  data_point_result?: string
  data_point_credit_score_range?: string
  data_point_vertical?: string
  review_topic?: string
  topic_recommendation_status?: 'pending' | 'approved' | 'rejected'
  story_id?: string
  has_hacker_news_references?: boolean
  time_range?: '1d' | '1w' | '1m' | '1y' | 'all'
  topic?: string
  topics?: string[]
  url?: string
}
