import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { getRssFeedByIdCached } from '@services/entity-fetch'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import { searchRssFeeds } from '@services/rss-feeds'
import { prepareRssFeedsSearchParams, resolveRssFeedsSearchParams } from '@services/search-params'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { findPageOrNull, INVALID_CURSOR_RESULT, EMPTY_PAGE_INFO } from './paged-search.mts'
import { mcpRssFeedSchema, toMcpRssFeed, type McpRssFeed } from './mcp-rss-output.mts'
import { pageInfoSchema, type McpPage } from './mcp-read-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ListArgs = {
  q?: string
  text_search_query?: string
  feed_type?: 'article' | 'podcast' | 'video' | 'mixed'
  enabled?: boolean | null
  discoverable?: boolean | null
  apply_mutes?: boolean
  limit?: number
  after?: string
}
type DetailArgs = { rss_feed_id: string }
type ListResult = McpPage<McpRssFeed> | typeof INVALID_CURSOR_RESULT
type DetailResult = { success: true; rss_feed: McpRssFeed } | { success: false; error: string }
const MAX_LIMIT = 25

export const searchRssFeedsTool: Tool<ListArgs, ListResult> = {
  schema: {
    name: 'search_rss_feeds',
    type: 'function',
    description: `Search RSS feeds by title, type and current state. Returns at most ${MAX_LIMIT} feeds per page and page_info.end_cursor for the next page. Text search has no cursor, as on REST.`,
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        text_search_query: { type: 'string' },
        feed_type: { type: 'string', enum: ['article', 'podcast', 'video', 'mixed'] },
        enabled: { type: ['boolean', 'null'] },
        discoverable: { type: ['boolean', 'null'] },
        apply_mutes: { type: 'boolean', description: 'Exclude your muted feeds, as on REST.' },
        limit: { type: 'integer', minimum: 1, description: 'Defaults to 25; clamped to 25.' },
        after: { type: 'string' },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Search RSS Feeds',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feeds' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: mcpRssFeedSchema() },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ListArgs): Promise<ListResult> => {
      const page = await findPageOrNull(args.after, async () => {
        const prepared = prepareRssFeedsSearchParams({
          q: args.q,
          text_search_query: args.text_search_query,
          feed_type: args.feed_type,
          enabled: args.enabled === undefined ? undefined : String(args.enabled),
          discoverable: args.discoverable === undefined ? undefined : String(args.discoverable),
        })
        const { shouldReturnEmpty, searchOptions } = await resolveRssFeedsSearchParams(prepared)
        if (shouldReturnEmpty) return { results: [], page_info: EMPTY_PAGE_INFO }
        if (args.after && searchOptions.text_search_query) return null
        const cursorId = args.after
          ? decodeUuidCursor(args.after, isSimpleCursor, 'Invalid cursor').id
          : undefined
        const limit = clampToolLimit(args.limit, MAX_LIMIT, MAX_LIMIT)
        const feeds = await searchRssFeeds({
          ...searchOptions,
          limit: limit + 1,
          cursorId,
          ...(args.apply_mutes ? { current_user_id: currentUser.id } : {}),
        })
        const results = feeds.slice(0, limit)
        return {
          results: await Promise.all(results.map(toMcpRssFeed)),
          page_info: buildPageInfo(results, {
            hasNextPage: feeds.length > limit && !searchOptions.text_search_query,
            getCursor: feed => ({ id: feed.id }),
          }),
        }
      })
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, ...page }
    },
}

export const getRssFeedTool: Tool<DetailArgs, DetailResult> = {
  schema: {
    name: 'get_rss_feed',
    type: 'function',
    description:
      'Get an RSS feed by UUID, including disabled or non-discoverable feeds as the REST detail route does.',
    parameters: {
      type: 'object',
      properties: { rss_feed_id: { type: 'string', format: 'uuid' } },
      required: ['rss_feed_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get RSS Feed',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feeds/:id' }],
    outputSchema: foundOrNotFoundSchema({ rss_feed: mcpRssFeedSchema() }),
  },
  function:
    (_currentUser: BasicUser) =>
    async ({ rss_feed_id }: DetailArgs): Promise<DetailResult> => {
      if (!isUUID(rss_feed_id)) return { success: false, error: 'RSS feed not found' }
      const feed = await getRssFeedByIdCached(rss_feed_id)
      if (!feed) return { success: false, error: 'RSS feed not found' }
      return { success: true, rss_feed: await toMcpRssFeed(feed as ViewRssFeed) }
    },
}

export const rssFeedReadTools = [searchRssFeedsTool, getRssFeedTool]
