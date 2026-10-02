import { getCommunityPostsPage } from '@services/communities'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import {
  COMMUNITY_NOT_FOUND,
  COMMUNITY_PAGE_LIMIT,
  communityPageInfoSchema,
  communityPageInputProperties,
  loadPublicCommunity,
} from './mcp-community-output.mts'
import { loadMcpPosts, mcpPostSchema, type McpPost } from './mcp-post-output.mts'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  type SearchPageInfo,
} from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

// The sorts GET /api/v1/communities/:idOrSlug/posts accepts.
const POST_SORTS = ['new', 'hot'] as const

type ToolArgs = {
  community_id: string
  sort?: (typeof POST_SORTS)[number]
  q?: string
  limit?: number
  after?: string
}

type ToolResult =
  | {
      success: true
      pinned_post_ids: string[]
      results: McpPost[]
      page_info: SearchPageInfo
    }
  | typeof COMMUNITY_NOT_FOUND
  | InvalidCursorResult

const { default: defaultLimit, max } = COMMUNITY_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_community_posts',
    type: 'function',
    description: `List the approved posts of a public community by its UUID or slug, newest first or by hot, as a signed-out reader sees them: an anonymous post never names its author, whoever asks. q matches post text and may carry #hashtags. Pinned posts are left out of every unfiltered page; their ids come back in pinned_post_ids on the first unfiltered page only (read them with get_community_pinned_posts). Returns at most ${max} posts per page and page_info.end_cursor; pass it as after, with the same sort, to get the next page. A private, deleted or unknown community returns { success: false, error: "Community not found" }. A malformed cursor, or one from a different sort, returns { success: false, error: "Invalid cursor" }.`,
    parameters: {
      type: 'object',
      properties: {
        community_id: { type: 'string', description: 'Community UUID or slug' },
        sort: {
          type: 'string',
          enum: [...POST_SORTS],
          description: 'Sort order: new (most recent, the default) or hot',
        },
        q: {
          type: 'string',
          description:
            'Keyword search over the posts. Same as the REST q: matches text and #hashtags.',
        },
        ...communityPageInputProperties('Posts'),
      },
      required: ['community_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Community Posts',
    requiredScopes: { mcp: ['communities:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/communities/:idOrSlug/posts' }],
    outputSchema: foundOrNotFoundSchema({
      pinned_post_ids: { type: 'array', items: { type: 'string' } },
      results: { type: 'array', items: mcpPostSchema() },
      page_info: communityPageInfoSchema(),
    }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const community = await loadPublicCommunity(args.community_id)
      if (!community) return COMMUNITY_NOT_FOUND
      const page = await findPageOrNull(args.after, () =>
        getCommunityPostsPage(community.id, {
          currentUser: null,
          q: args.q,
          sort: args.sort ?? 'new',
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        pinned_post_ids: page.pinned_post_ids,
        results: await loadMcpPosts(page.results.map(post => post.id)),
        page_info: page.page_info,
      }
    },
}

export default tool
