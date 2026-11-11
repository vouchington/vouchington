import {
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryEnum,
  queryNumber,
  queryString,
  queryUuid,
  queryUuidOrUri,
} from '@vouchington/pagination'
import { createPaginationParser } from '@modules/pagination'
import { VALID_SEARCH_POST_TYPES } from '@ts-shared/feed-capabilities'

export const postsParser = createPaginationParser({
  cursor: { type: ['simple', 'score', 'ranking'] as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    timeRange: true,
    sort: ['new', 'best', 'hot', 'trending', 'relevance', 'following_new'] as const,
    search: true,
  },
})
export const postsQueryContract = defineQueryContract({
  post_types: queryCsvArray(queryEnum(VALID_SEARCH_POST_TYPES)),
  q: queryString(),
  topic: queryString(),
  topics: queryCsvArray(queryString()),
  category: queryString(),
  categories: queryCsvArray(queryString()),
  creator: queryString(),
  community_id: queryUuid(),
  trending_min_score: queryNumber(),
  url: queryUuidOrUri(),
  similar_post: queryString(),
  similar_topic: queryString(),
  review_topic: queryString(),
  data_point_topic: queryString(),
  similar_rss_feed_item: queryUuid(),
  drafts: queryBoolean(),
  has_hacker_news_references: queryBoolean(),
  data_point_vertical: queryString(),
  story_id: queryUuid(),
})
