import type { MergedToolSource } from './create-merged-tool.mts'
import { communityReferenceSchema } from './entity-reference-schema.mts'
import { searchCommunityListItems, type CommunityListItemType } from '@services/communities'
import type { ToolApiEndpoint } from '@services/openai-agents/tool-types'
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
import { selectApiByArgument } from '@vouchington/mcp-server/tools'
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

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "List a public community's curated item_type in list order, as a signed-out reader sees it. entity_id identifies each entry; label gives hostname, URL or feed title where no tool reads by id, or null if unreadable. Unreadable posts are omitted. Read topics with read_topic (option details), posts with read_posts (option details), and totals with read_community (option list_item_counts).",
    parameters: {
      type: 'object',
      properties: {
        community_id: communityReferenceSchema,
        item_type: {
          type: 'string',
          enum: [...COMMUNITY_LIST_ITEM_TYPES],
        },
        ...communityPageInputProperties('Entries'),
      },
      required: ['community_id', 'item_type'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Community List Items',
    requiredScopes: ['communities:read'],
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
