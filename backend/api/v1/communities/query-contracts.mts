import {
  defineQueryContract,
  createPaginationParser,
  queryBoolean,
  queryEnum,
  queryInteger,
  queryNumber,
  queryString,
} from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import {
  VALID_COMMUNITY_NEWS_FEED_TYPES,
  type CommunityNewsFeedType,
} from '@ts-shared/feed-capabilities'

export const communityPageQuery = defineQueryContract({
  limit: queryInteger({ minimum: 1, maximum: 100 }),
  after: queryString(),
})

export const communityApplicationsQuery = defineQueryContract({
  ...communityPageQuery.queryContract,
  status: queryEnum(['pending', 'approved', 'rejected']),
})

export const communityMembersQuery = defineQueryContract({
  ...communityPageQuery.queryContract,
  role: queryEnum(['owner', 'moderator', 'member']),
})

export const communityPostsQuery = defineQueryContract({
  ...communityPageQuery.queryContract,
  sort: queryEnum(['new', 'hot']),
  q: queryString(),
})

export const communityModerationAnalyticsQuery = defineQueryContract({
  range: queryEnum(['today', '7d', '30d', '90d', 'all']),
})

export const communityModeratorStatsQuery = defineQueryContract({
  window: queryEnum(['30', '90']),
})

export const communityAutomodActionsQuery = defineQueryContract({
  window: queryEnum(['24h', '48h', '7d']),
  limit: queryInteger({ minimum: 1, maximum: 100 }),
  after: queryString(),
  source: queryEnum(['agent_moderation', 'openai_omni', 'spam_detection', 'community_prompt']),
  agent: queryString(),
  post_type: queryEnum([
    'discussion',
    'review',
    'data_point',
    'story',
    'topic_recommendation',
    'comment',
    'article',
    'blog_post',
  ]),
  content_type: queryEnum([
    'discussion',
    'review',
    'data_point',
    'story',
    'topic_recommendation',
    'comment',
    'article',
    'blog_post',
  ]),
  max_confidence: queryNumber(),
})

export const communityModerationQueueQuery = defineQueryContract({
  limit: queryInteger({ minimum: 1, maximum: 100 }),
  after: queryString(),
  source: queryEnum(['report', 'community_review', 'automod_flag']),
})

export const communityNewsQuery = defineQueryContract({
  q: queryString(),
  has_related_posts: queryBoolean(),
  feed_type: queryEnum(VALID_COMMUNITY_NEWS_FEED_TYPES),
})

export const communityNewsParser = createPaginationParser({
  cursor: { type: 'timestamp' as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: { timeRange: true },
})

export function communityNewsQueryInput(
  raw: Record<string, unknown>,
  limit: number,
  timeRange: string | undefined,
  hasRelatedPosts: boolean | undefined,
  feedType: CommunityNewsFeedType,
): Record<string, unknown> {
  const query = prepareQueryForValidation(raw, {
    ...communityNewsParser.queryContract,
    ...communityNewsQuery.queryContract,
  })
  const parsed = Object.fromEntries(
    Object.entries(query).filter(
      ([key]) =>
        key !== 'limit' &&
        key !== 'time_range' &&
        key !== 'has_related_posts' &&
        key !== 'feed_type',
    ),
  )
  return {
    ...parsed,
    ...(raw.limit !== undefined && { limit }),
    ...(raw.time_range !== undefined && timeRange !== undefined && { time_range: timeRange }),
    ...(raw.has_related_posts !== undefined &&
      hasRelatedPosts !== undefined && {
        has_related_posts: hasRelatedPosts,
      }),
    ...(raw.feed_type !== undefined && { feed_type: feedType }),
  }
}

// These routes pass Number(rawLimit) to a service that enforces 1..100, but treat an empty
// limit or cursor as absent. Validate the same effective input without changing those defaults.
export function communityPageQueryInput(query: Record<string, unknown>): Record<string, unknown> {
  const prepared = prepareQueryForValidation(query, communityPageQuery.queryContract)
  return Object.fromEntries(
    Object.entries(prepared).filter(
      ([key]) =>
        !(key === 'limit' && query.limit === '') && !(key === 'after' && query.after === ''),
    ),
  )
}
