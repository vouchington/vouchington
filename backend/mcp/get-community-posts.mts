import type { MergedToolSource } from './create-merged-tool.mts'
import { getCommunityPostsPage } from '@services/communities'
import type { BasicUser } from '@services/users/types'
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

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "List a public community's approved posts as a signed-out reader sees them, newest or hot first. Anonymous posts never name their author. q matches text and #hashtags. Unfiltered pages exclude pins; pinned_post_ids appears only on the first. Read them with read_community (option pinned_posts).",
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
  },
  meta: {
    audience: 'user',
    title: 'Get Community Posts',
    requiredScopes: ['communities:read'],
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
