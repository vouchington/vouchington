import { getRssFeedItemFeedIds, VALID_RSS_FEED_ITEM_FEED_TYPES } from '@services/feeds'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { requirePrivateToolUser } from './private-user.mts'
import { pageInfoSchema } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT } from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'
import {
  commonProperties,
  feedItemSchema,
  getCommunityId,
  hashtagOptions,
  MAX_LIMIT,
  type FeedResult,
  type ItemArgs,
} from './personal-feed-support.mts'

export const getRssFeedItemFeedTool: Tool<ItemArgs, FeedResult> = {
  schema: {
    name: 'get_rss_feed_item_feed',
    type: 'function',
    description:
      'Page RSS items delivered to your own feed. Results identify each item for get_rss_feed_item; the domain feed service applies the REST follow, community and content policy. Returns at most 100 per page.',
    parameters: {
      type: 'object',
      properties: {
        ...commonProperties,
        feed_type: { type: 'string', enum: [...VALID_RSS_FEED_ITEM_FEED_TYPES] },
        min_score_follow_rss_feeds: { type: 'number' },
        has_related_posts: { type: 'boolean' },
        media_types: {
          type: 'array',
          items: { type: 'string', enum: ['article', 'audio', 'video'] },
        },
      },
      required: ['feed_type'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get RSS Feed Item Feed',
    plan: 'free',
    requiredScopes: { mcp: ['feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/feeds/rss_feed_items/:feed_type' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: feedItemSchema('ViewRssFeedItem') },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ItemArgs): Promise<FeedResult> => {
      const viewer = await requirePrivateToolUser(currentUser)
      const page = await findPageOrNull(args.after, async () => {
        const hashtag = await hashtagOptions(args.q)
        const result = await getRssFeedItemFeedIds(viewer, {
          ...hashtag,
          text_search_query: hashtag.text_search_query ?? args.text_search_query,
          community_id: await getCommunityId(viewer, args.feed_type, args.community),
          feed_type: args.feed_type,
          time_range: args.time_range,
          min_score_follow_rss_feeds: args.min_score_follow_rss_feeds,
          min_score_follow_topics: args.min_score_follow_topics,
          has_related_posts: args.has_related_posts,
          media_types: args.media_types,
          limit: clampToolLimit(args.limit, 25, MAX_LIMIT),
          after: args.after,
        })
        return {
          results: result.results.map(row => ({
            id: row.id,
            entity_id: row.entity_id,
            delivery_type: row.delivery_type,
            shared_by_user_id: row.shared_by_user_id ?? null,
            shared_at: row.shared_at ? new Date(row.shared_at).toISOString() : null,
          })),
          page_info: result.page_info,
        }
      })
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, ...page }
    },
}

export default getRssFeedItemFeedTool
