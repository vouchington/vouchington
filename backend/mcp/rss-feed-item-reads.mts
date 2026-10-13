import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import { getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { searchRssFeedItems } from '@services/rss-feed-items'
import { isAdminUser } from '@services/users/authorization'
import {
  prepareRssFeedItemsSearchParams,
  resolveRssFeedItemsSearchParams,
} from '@services/search-params'
import { isUUID } from '@modules/utils'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  EMPTY_PAGE_INFO,
  pagedSearchQuery,
  pagedSearchSchemaProperties,
  type PagedSearchArgs,
} from './paged-search.mts'
import { mcpRssFeedItemSchema, toMcpRssFeedItem, type McpRssFeedItem } from './mcp-rss-output.mts'
import { pageInfoSchema, type McpPage } from './mcp-read-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ListArgs = PagedSearchArgs & {
  rss_feed_id?: string
  media_type?: 'article' | 'audio' | 'video' | Array<'article' | 'audio' | 'video'>
  read?: boolean
  category_topic?: string
  category_topics?: string[]
  has_related_posts?: boolean
  media_types?: Array<'article' | 'audio' | 'video'>
  rss_feed?: string
  rss_feeds?: string[]
  similar_window_days?: number
  story_id?: string
  topic?: string
  topics?: string[]
}
type DetailArgs = { rss_feed_item_id: string }
type ListResult = McpPage<McpRssFeedItem> | typeof INVALID_CURSOR_RESULT
type DetailResult =
  | { success: true; rss_feed_item: McpRssFeedItem }
  | { success: false; error: string }

export const listRssFeedItemsTool: MergedToolSource<ListArgs, ListResult> = {
  schema: {
    description:
      'Search and page RSS feed items by keyword, semantic text, similar item, feed, media type or read state. Returns at most 100 items per page and page_info.end_cursor for the next page. The old internal search_rss_feed_items tool has no cursor; use this tool for MCP reads.',
    parameters: {
      type: 'object',
      properties: {
        ...pagedSearchSchemaProperties('Keyword or hashtag search, like the REST q parameter.'),
        limit: {
          type: 'integer',
          minimum: 1,
          description: 'Items per page; defaults to 10 and clamps at 100.',
        },
        rss_feed_id: { type: 'string', format: 'uuid' },
        media_type: {
          anyOf: [
            { type: 'string', enum: ['article', 'audio', 'video'] },
            { type: 'array', items: { type: 'string', enum: ['article', 'audio', 'video'] } },
          ],
        },
        read: { type: 'boolean', description: 'Filter by your own read state.' },
        category_topic: { type: 'string' },
        category_topics: { type: 'array', items: { type: 'string' } },
        has_related_posts: { type: 'boolean' },
        media_types: {
          type: 'array',
          items: { type: 'string', enum: ['article', 'audio', 'video'] },
        },
        rss_feed: { type: 'string', format: 'uuid' },
        rss_feeds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        similar_window_days: { type: 'integer', minimum: 0, maximum: 365 },
        story_id: { type: 'string', format: 'uuid' },
        topic: { type: 'string' },
        topics: { type: 'array', items: { type: 'string' } },
      },
      required: [],
    },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'List RSS Feed Items',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feed-items:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feed-items' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: mcpRssFeedItemSchema() },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ListArgs): Promise<ListResult> => {
      const page = await findPageOrNull(args.after, async () => {
        const query = {
          ...pagedSearchQuery(args),
          ...(args.rss_feed_id && { rss_feed: args.rss_feed_id }),
          ...(args.media_type && { media_type: args.media_type }),
          ...(args.read !== undefined && { read: String(args.read) }),
          category_topic: args.category_topic,
          category_topics: args.category_topics,
          has_related_posts: args.has_related_posts,
          media_types: args.media_types,
          rss_feed: args.rss_feed ?? args.rss_feed_id,
          rss_feeds: args.rss_feeds,
          similar_window_days: args.similar_window_days,
          story_id: args.story_id,
          topic: args.topic,
          topics: args.topics,
        }
        const prepared = prepareRssFeedItemsSearchParams(query)
        const { shouldReturnEmpty, searchOptions } = await resolveRssFeedItemsSearchParams(prepared)
        if (shouldReturnEmpty) return { results: [], page_info: EMPTY_PAGE_INFO }
        const result = await searchRssFeedItems({
          ...searchOptions,
          limit: clampToolLimit(args.limit, 10, 100),
          currentUserId: currentUser.id,
          isAdministrator: isAdminUser(currentUser),
        })
        const items = await getRssFeedItemByIdCachedBatch(result.results.map(entry => entry.id))
        return {
          results: await Promise.all(
            items
              .filter((item): item is NonNullable<typeof item> => item !== null)
              .map(toMcpRssFeedItem),
          ),
          page_info: result.page_info,
        }
      })
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, ...page }
    },
}

export const getRssFeedItemTool: MergedToolSource<DetailArgs, DetailResult> = {
  schema: {
    description: 'Get an RSS feed item by UUID, with article text marked as external content.',
    parameters: {
      type: 'object',
      properties: { rss_feed_item_id: { type: 'string', format: 'uuid' } },
      required: ['rss_feed_item_id'],
    },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get RSS Feed Item',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feed-items:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feed-items/:id' }],
    outputSchema: foundOrNotFoundSchema({ rss_feed_item: mcpRssFeedItemSchema() }),
  },
  function:
    (_currentUser: BasicUser) =>
    async ({ rss_feed_item_id }: DetailArgs): Promise<DetailResult> => {
      if (!isUUID(rss_feed_item_id)) return { success: false, error: 'RSS feed item not found' }
      const item = await getRssFeedItemById(rss_feed_item_id)
      if (!item) return { success: false, error: 'RSS feed item not found' }
      return { success: true, rss_feed_item: await toMcpRssFeedItem(item) }
    },
}

export const rssFeedItemReadTools = [listRssFeedItemsTool, getRssFeedItemTool]
