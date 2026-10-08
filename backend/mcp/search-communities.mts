import { resolveCommunityHashtagQuery, searchCommunities } from '@services/communities'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import {
  COMMUNITY_PAGE_LIMIT,
  communityPageInfoSchema,
  communityPageInputProperties,
  mcpCommunityEntryProperties,
  toMcpCommunityEntries,
  type McpCommunityEntry,
} from './mcp-community-output.mts'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  type SearchPageInfo,
} from './paged-search.mts'
import { closedObject, foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

// The sorts GET /api/v1/communities accepts.
const COMMUNITY_SORTS = ['name', 'members', 'virtual_subscriptions'] as const

type ToolArgs = {
  q?: string
  sort?: (typeof COMMUNITY_SORTS)[number]
  limit?: number
  after?: string
  feed_category?: 'posts' | 'news' | 'news_sources' | 'news_topics'
  has_list_items?: boolean
  has_list_type?: boolean
  list_type?: 'follow' | 'mute'
  topic?: string[]
}

type ToolResult =
  | { success: true; results: McpCommunityEntry[]; page_info: SearchPageInfo }
  | InvalidCursorResult

const { default: defaultLimit, max } = COMMUNITY_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_communities',
    type: 'function',
    description: `Search public communities, as a signed-out reader sees them: a private community never appears, whoever asks. q matches names and descriptions and may carry #hashtags. Sorted by name (the default, A to Z), members or virtual_subscriptions (most first). Returns at most ${max} communities per page and page_info.end_cursor; pass it as after, with the same sort, to get the next page.`,
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Keyword search. Same as GET /api/v1/communities q.' },
        sort: {
          type: 'string',
          enum: [...COMMUNITY_SORTS],
          description:
            'Sort order: name (A to Z, the default), members (most members first), virtual_subscriptions (most follows first)',
        },
        ...communityPageInputProperties('Communities'),
        feed_category: { type: 'string', enum: ['posts', 'news', 'news_sources', 'news_topics'] },
        has_list_items: { type: 'boolean' },
        has_list_type: { type: 'boolean' },
        list_type: { type: 'string', enum: ['follow', 'mute'] },
        topic: { type: 'array', items: { type: 'string', format: 'uuid' } },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Search Communities',
    requiredScopes: { mcp: ['communities:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/communities' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: closedObject(mcpCommunityEntryProperties()) },
      page_info: communityPageInfoSchema(),
    }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const hashtags = await resolveCommunityHashtagQuery(args.q)
      const page = await findPageOrNull(args.after, () =>
        searchCommunities({
          currentUser: null,
          search: hashtags.search,
          topicIds:
            hashtags.topicIds.length > 0 || (args.topic?.length ?? 0) > 0
              ? [...new Set([...hashtags.topicIds, ...(args.topic ?? [])])]
              : undefined,
          feedCategory: args.feed_category,
          hasListItems: args.has_list_items || undefined,
          hasListType: args.has_list_type || undefined,
          listType: args.list_type,
          hashtagHasNoMatches: hashtags.hashtagHasNoMatches,
          sort: args.sort ?? 'name',
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await toMcpCommunityEntries(
          page.results.map(community => ({
            community,
            owner: page.users[community.created_by_id] ?? null,
            metrics: page.community_metrics[community.id],
          })),
        ),
        page_info: page.page_info,
      }
    },
}

export default tool
