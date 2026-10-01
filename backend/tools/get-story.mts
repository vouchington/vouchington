import { isUUID } from '@modules/utils'
import { getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import { getStoryMemberPagesBatch } from '@services/feeds/rss-feed-items/story-member-pages'
import type { BasicUser } from '@services/users/types'
import createHttpError from 'http-errors'
import type { Tool } from './types.mts'
import {
  mcpStoryItemSchema,
  mcpStorySchema,
  toMcpStory,
  toMcpStoryItem,
  type McpStory,
  type McpStoryItem,
} from './mcp-story-output.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  story_id: string
  limit?: number
  after?: string
  exclude_item_id?: string
}

type PageInfo = { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }

type ToolResult =
  | { success: true; story: McpStory; items: McpStoryItem[]; page_info: PageInfo }
  | { success: false; error: string }

// The REST route's page size: at most 25 related articles, all of them by default.
const MAX_LIMIT = 25

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_story',
    type: 'function',
    description:
      'Get one news story by its UUID: its title, why its articles were grouped, and one cursor page of the articles that belong to it, newest first. Pass page_info.end_cursor as after to read the next page while page_info.has_next_page is true. A deleted or missing story returns { success: false, error: "Story not found" }. A malformed cursor returns { success: false, error: "Invalid cursor" }.',
    parameters: {
      type: 'object',
      properties: {
        story_id: { type: 'string', description: 'Story UUID' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `Articles per page, from 1 to ${MAX_LIMIT} (default: ${MAX_LIMIT})`,
        },
        after: { type: 'string', description: 'Opaque cursor from the previous page' },
        exclude_item_id: {
          type: 'string',
          description: 'UUID of an article to leave out, such as the one being read',
        },
      },
      required: ['story_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Story',
    requiredScopes: { mcp: ['posts:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/stories/:id' }],
    outputSchema: foundOrNotFoundSchema({
      story: mcpStorySchema(),
      items: { type: 'array', items: mcpStoryItemSchema() },
      page_info: closedObject(
        pickProperties('PageInfo', ['has_next_page', 'start_cursor', 'end_cursor']),
      ),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      if (!isUUID(args.story_id)) return { success: false, error: 'Story not found' }
      if (args.exclude_item_id !== undefined && !isUUID(args.exclude_item_id)) {
        return { success: false, error: 'Invalid excluded item ID' }
      }
      const story = await getStoryById(args.story_id)
      if (!story) return { success: false, error: 'Story not found' }

      const requests = [
        { story_id: story.id, exclude_item_id: args.exclude_item_id, after: args.after },
      ]
      const pages = await getStoryMemberPagesBatch(currentUser, requests, {
        limit: clampToolLimit(args.limit, MAX_LIMIT, MAX_LIMIT),
      }).catch((error: unknown) => {
        if (createHttpError.isHttpError(error) && error.status === 400) return null
        throw error
      })
      const page = pages?.[story.id]
      if (!page) return { success: false, error: 'Invalid cursor' }

      const items = await getRssFeedItemByIdCachedBatch(page.item_ids)
      return {
        success: true,
        story: await toMcpStory(story),
        items: await Promise.all(
          items
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map(toMcpStoryItem),
        ),
        page_info: page.page_info,
      }
    },
}

export default tool
