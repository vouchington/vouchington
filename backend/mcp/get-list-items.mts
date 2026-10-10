import { searchListItems } from '@services/lists'
import type { Tool, ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { loadReadableList } from './list-read-access.mts'
import {
  LIST_NOT_FOUND,
  LIST_PAGE_LIMIT,
  mcpListItemSchema,
  toMcpListItem,
  type McpListItem,
} from './mcp-list-output.mts'
import { resolveReadableThreads } from './mcp-post-access.mts'
import { pageInputProperties, pageProperties, type McpPage } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  list_id: string
  media_type?: string
  limit?: number
  after?: string
  read?: boolean
}

type ToolResult = McpPage<McpListItem> | typeof LIST_NOT_FOUND | InvalidCursorResult

const { default: defaultLimit, max } = LIST_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_list_items',
    type: 'function',
    description: `List the items on a list, newest first: each is a post or an RSS feed item, with the item_type and entity_id to read it with (get_post or get_rss_feed_item). The list must be readable as get_list describes; otherwise this returns { success: false, error: "List not found" }. A post the caller cannot read, such as a private or deleted post, is left out, so a page can hold fewer items than limit while page_info.has_next_page is still true: keep paging until it is false. media_type keeps only RSS feed items of that media type. Returns at most ${max} items per page and page_info.end_cursor; pass it as after to get the next page.`,
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'string', format: 'uuid', description: 'The ID of the list.' },
        media_type: { type: 'string', description: 'Only RSS feed items of this media type' },
        read: { type: 'boolean', description: 'Filter RSS feed items by your read state.' },
        ...pageInputProperties('Items', LIST_PAGE_LIMIT),
      },
      required: ['list_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get List Items',
    requiredScopes: { mcp: ['lists:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/lists/:id/items' }],
    outputSchema: foundOrNotFoundSchema(pageProperties(mcpListItemSchema())),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs, invocationContext?: ToolInvocationContext): Promise<ToolResult> => {
      const list = await loadReadableList(currentUser, args.list_id, invocationContext)
      if (!list) return LIST_NOT_FOUND
      const page = await findPageOrNull(args.after, () =>
        searchListItems(list.id, {
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
          mediaType: args.media_type,
          ...(args.read !== undefined && { read: args.read, currentUserId: currentUser.id }),
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      // One batch read for the whole page, never a lookup per item.
      const postItems = page.results.filter(item => item.item_type === 'post')
      const threads = await resolveReadableThreads(
        currentUser,
        postItems.map(item => item.entity_id),
      )
      const hidden = new Set(postItems.filter((_, index) => !threads[index]))
      return {
        success: true,
        results: page.results.filter(item => !hidden.has(item)).map(toMcpListItem),
        // The cursor comes from the unfiltered page, so it advances past every hidden item.
        page_info: page.page_info,
      }
    },
}

export default tool
