import { getPostFeedIds, VALID_POST_FEED_TYPES } from '@services/feeds'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { VALID_FILTERABLE_POST_TYPES } from '@ts-shared/feed-capabilities'
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
  type PostArgs,
} from './personal-feed-support.mts'

const getPostFeedTool: Tool<PostArgs, FeedResult> = {
  schema: {
    name: 'get_post_feed',
    type: 'function',
    description:
      'Page posts delivered to your own feed. Results identify each post for get_post; the domain feed service applies the REST follow, community and content policy. Returns at most 100 per page.',
    parameters: {
      type: 'object',
      properties: {
        ...commonProperties,
        feed_type: { type: 'string', enum: [...VALID_POST_FEED_TYPES] },
        post_types: {
          type: 'array',
          items: { type: 'string', enum: [...VALID_FILTERABLE_POST_TYPES] },
        },
        sort: { type: 'string', enum: ['new', 'hot'] },
        min_score_follow_users: { type: 'number' },
      },
      required: ['feed_type'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Post Feed',
    plan: 'free',
    requiredScopes: { mcp: ['feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/feeds/posts/:feed_type' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: feedItemSchema('Post') },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: PostArgs): Promise<FeedResult> => {
      const viewer = await requirePrivateToolUser(currentUser)
      const page = await findPageOrNull(args.after, async () => {
        const hashtag = await hashtagOptions(args.q)
        const result = await getPostFeedIds(viewer, {
          ...hashtag,
          text_search_query: hashtag.text_search_query ?? args.text_search_query,
          community_id: await getCommunityId(viewer, args.feed_type, args.community),
          feed_type: args.feed_type,
          post_types: args.post_types,
          sort: args.sort,
          time_range: args.time_range,
          min_score_follow_users: args.min_score_follow_users,
          min_score_follow_topics: args.min_score_follow_topics,
          limit: clampToolLimit(args.limit, 25, MAX_LIMIT),
          after: args.after,
        })
        return {
          results: result.results.map(row => ({
            id: row.id,
            entity_id: row.entity_id,
            delivery_type: row.delivery_type,
            shared_by_id: row.shared_by_id ?? null,
            shared_at: row.shared_at ? new Date(row.shared_at).toISOString() : null,
          })),
          page_info: result.page_info,
        }
      })
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, ...page }
    },
}

export default getPostFeedTool
