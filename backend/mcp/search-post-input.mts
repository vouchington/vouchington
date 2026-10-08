import type { PostSearchSort } from '@services/posts/search/types'
import { VALID_FILTERABLE_POST_TYPES } from '@ts-shared/feed-capabilities'

export const POST_SORTS = [
  'new',
  'best',
  'hot',
  'relevance',
  'following_new',
] as const satisfies readonly PostSearchSort[]

/** Public REST post search filters, plus the existing singular post-type convenience. */
export function postSearchFilterSchemaProperties() {
  return {
    sort: {
      type: 'string',
      enum: [...POST_SORTS],
      description:
        'Sort order: new (most recent), best (highest voted), hot, relevance (search relevance; the default when searching), following_new',
    },
    post_type: {
      type: 'string',
      enum: [...VALID_FILTERABLE_POST_TYPES],
      description: 'Filter by post type',
    },
    post_types: {
      type: 'array',
      items: { type: 'string', enum: [...VALID_FILTERABLE_POST_TYPES] },
    },
    categories: { type: 'array', items: { type: 'string' } },
    category: { type: 'string' },
    creator: { type: 'string' },
    data_point_topic: { type: 'string' },
    data_point_vertical: { type: 'string' },
    review_topic: { type: 'string' },
    story_id: { type: 'string', format: 'uuid' },
    time_range: { type: 'string', enum: ['1d', '1w', '1m', '1y', 'all'] },
    topic: { type: 'string' },
    topics: { type: 'array', items: { type: 'string' } },
    url: {
      anyOf: [
        { type: 'string', format: 'uuid' },
        { type: 'string', format: 'uri' },
      ],
    },
  }
}
