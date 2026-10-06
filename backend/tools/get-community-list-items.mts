import { searchCommunityListItems, type CommunityListItemType } from '@services/communities'
import type { Tool, ToolApiEndpoint } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import {
  COMMUNITY_LIST_ITEM_TYPES,
  mcpCommunityListItemSchema,
  toMcpCommunityListItems,
  type McpCommunityListItem,
} from './mcp-community-list-item-output.mts'
import {
  COMMUNITY_NOT_FOUND,
  COMMUNITY_PAGE_LIMIT,
  communityPageInputProperties,
  loadPublicCommunity,
} from './mcp-community-output.mts'
import { pageProperties, type McpPage } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { selectApiByArgument } from './select-api-by-argument.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  community_id: string
  item_type: CommunityListItemType
  limit?: number
  after?: string
}

type ToolResult = McpPage<McpCommunityListItem> | typeof COMMUNITY_NOT_FOUND | InvalidCursorResult

const { default: defaultLimit, max } = COMMUNITY_PAGE_LIMIT
const listItemsEndpoint = (route: string): ToolApiEndpoint => ({
  method: 'GET',
  path: `/api/v1/communities/:idOrSlug/list-items/${route}`,
})
const ENDPOINTS: Record<CommunityListItemType, ToolApiEndpoint> = {
  topic: listItemsEndpoint('topics'),
  rss_feed: listItemsEndpoint('rss-feeds'),
  post: listItemsEndpoint('posts'),
  url_hostname: listItemsEndpoint('domains'),
  url: listItemsEndpoint('urls'),
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_community_list_items',
    type: 'function',
    description: `List the entries of a public community's curated list of one item_type, by the community's UUID or slug, in list order, as a signed-out reader sees them: topic, rss_feed, post, url_hostname or url. Each entry has an id, the item_type, the entity_id it points at, its order_index and created_at. label names the entity where no other tool reads it by id: the hostname for url_hostname, the page URL for url and the feed title for rss_feed (null if the entity can no longer be read). Read a topic with get_topic_details and a post with get_post (their label is null). A post the public cannot see (a private or deleted one, say) is left out of the page and of the counts. Returns at most ${max} entries per page and page_info.end_cursor; pass it as after to get the next page. A private, deleted or unknown community returns { success: false, error: "Community not found" }. A malformed cursor returns { success: false, error: "Invalid cursor" }. get_community_list_item_counts gives the totals.`,
    parameters: {
      type: 'object',
      properties: {
        community_id: { type: 'string', description: 'Community UUID or slug' },
        item_type: {
          type: 'string',
          enum: [...COMMUNITY_LIST_ITEM_TYPES],
          description: 'The kind of entry to list',
        },
        ...communityPageInputProperties('Entries'),
      },
      required: ['community_id', 'item_type'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Community List Items',
    requiredScopes: { mcp: ['communities:read'] },
    annotations: { readOnlyHint: true },
    api: Object.values(ENDPOINTS),
    selectApi: selectApiByArgument('item_type', ENDPOINTS),
    outputSchema: foundOrNotFoundSchema(pageProperties(mcpCommunityListItemSchema())),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const community = await loadPublicCommunity(args.community_id)
      if (!community) return COMMUNITY_NOT_FOUND
      const page = await findPageOrNull(args.after, () =>
        searchCommunityListItems(community.id, args.item_type, {
          currentUser: null,
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await toMcpCommunityListItems(args.item_type, page.results),
        page_info: page.page_info,
      }
    },
}

export default tool
