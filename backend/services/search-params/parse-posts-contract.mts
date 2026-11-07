import {
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryString,
  queryUuid,
  queryUuidOrUri,
} from '@vouchington/pagination'
import { createPaginationParser } from '@modules/pagination'

export const postsParser = createPaginationParser({
  cursor: { type: ['simple', 'score', 'ranking'] as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    postTypes: true,
    timeRange: true,
    sort: ['new', 'best', 'hot', 'relevance', 'following_new'] as const,
    search: true,
  },
})
export const postsQueryContract = defineQueryContract({
  q: queryString(),
  topic: queryString(),
  topics: queryCsvArray(queryString()),
  category: queryString(),
  categories: queryCsvArray(queryString()),
  creator: queryString(),
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
