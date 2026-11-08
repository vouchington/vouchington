import type { PostSearchSort } from '@services/posts/search/types'
import { topicReferenceSchema, userReferenceSchema } from './entity-reference-schema.mts'
import { VALID_SEARCH_POST_TYPES } from '@ts-shared/feed-capabilities'

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
        'Sort by new, best, hot, trending, relevance, or following_new. Hot/trending use a stable age-weighted rank. Keyword relevance ranks bounded newest-first cohorts; its cursor finishes each cohort before advancing to older posts. Any sort can return a short or empty page with a continuation cursor.',
    },
    post_type: {
      type: 'string',
      enum: [...VALID_SEARCH_POST_TYPES],
    },
    post_types: {
      type: 'array',
      items: { type: 'string', enum: [...VALID_SEARCH_POST_TYPES] },
    },
    categories: { type: 'array', items: { type: 'string' } },
    category: { type: 'string' },
    creator: userReferenceSchema,
    community_id: { type: 'string', format: 'uuid' },
    trending_min_score: {
      type: 'number',
      minimum: 0,
      description:
        'Minimum age-decayed score; filtered pages can be short or empty with a continuation cursor.',
    },
    data_point_topic: topicReferenceSchema,
    data_point_vertical: { type: 'string' },
    review_topic: topicReferenceSchema,
    story_id: { type: 'string', format: 'uuid' },
    has_hacker_news_references: {
      type: 'boolean',
      description:
        'Only items whose URL is seen or mentioned on Hacker News (true) or not (false).',
    },
    time_range: postTimeRangeSchema,
    topic: topicReferenceSchema,
    topics: { type: 'array', items: topicReferenceSchema },
    url: {
      anyOf: [
        { type: 'string', format: 'uuid' },
        { type: 'string', format: 'uri' },
      ],
    },
  }
}
