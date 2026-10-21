import type { PostSearchSort } from '@services/posts/search/types'
import { topicReferenceSchema, userReferenceSchema } from './entity-reference-schema.mts'
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
    },
    post_types: {
      type: 'array',
      items: { type: 'string', enum: [...VALID_FILTERABLE_POST_TYPES] },
    },
    categories: { type: 'array', items: { type: 'string' } },
    category: { type: 'string' },
    creator: userReferenceSchema,
    data_point_topic: topicReferenceSchema,
    data_point_vertical: { type: 'string' },
    review_topic: topicReferenceSchema,
    story_id: { type: 'string', format: 'uuid' },
    time_range: { type: 'string', enum: ['1d', '1w', '1m', '1y', 'all'] },
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
