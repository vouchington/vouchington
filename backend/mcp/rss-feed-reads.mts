import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import { getRssFeedByIdCached } from '@services/entity-fetch'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import { buildRssFeedsPage, decodeRssFeedsCursor, searchRssFeeds } from '@services/rss-feeds'
import {
  MAX_TOPIC_SEARCH_TERMS,
  prepareRssFeedsSearchParams,
  resolveRssFeedsSearchParams,
  RSS_FEED_SORTS,
  RSS_FEED_TIME_RANGES,
  validateTopicSearchTerms,
} from '@services/search-params'
import { rssFeedReferenceSchema, topicReferenceSchema } from './entity-reference-schema.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import { resolvedTopicFilters } from './resolve-topic.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, EMPTY_PAGE_INFO } from './paged-search.mts'
import { mcpRssFeedSchema, toMcpRssFeeds, type McpRssFeed } from './mcp-rss-output.mts'
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
  category?: string
  include_descendants?: boolean
  publisher_type?: string
  publisher_type_match?: 'any' | 'all'
  publisher_types?: string[]
  topic?: string
  topic_match?: 'any' | 'all'
  topics?: string[]
  sort?: (typeof RSS_FEED_SORTS)[number]
  time_range?: (typeof RSS_FEED_TIME_RANGES)[number]
  limit?: number
  after?: string
}
type DetailArgs = { rss_feed_id: string }
type ListResult = McpPage<McpRssFeed> | typeof INVALID_CURSOR_RESULT
type DetailResult = { success: true; rss_feed: McpRssFeed } | { success: false; error: string }
const MAX_LIMIT = 25

export const searchRssFeedsTool: MergedToolSource<ListArgs, ListResult> = {
  schema: {
    description: `Search RSS feeds by title, type and current state. Up to ${MAX_LIMIT} feeds per page; continue with page_info.end_cursor. Text search has no cursor, as on REST. sort=trending ranks the feeds that gained follows or items in time_range (day, week or month; default week) and takes no filter besides apply_mutes, limit and after.`,
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        text_search_query: { type: 'string' },
        feed_type: { type: 'string', enum: ['article', 'podcast', 'video', 'mixed'] },
        enabled: { type: ['boolean', 'null'] },
        discoverable: { type: ['boolean', 'null'] },
        apply_mutes: { type: 'boolean', description: 'Exclude your muted feeds, as on REST.' },
        category: { type: 'string' },
        include_descendants: { type: 'boolean' },
        publisher_type: { type: 'string' },
        publisher_type_match: { type: 'string', enum: ['any', 'all'] },
        publisher_types: { type: 'array', items: { type: 'string' } },
        topic: topicReferenceSchema,
        topic_match: { type: 'string', enum: ['any', 'all'] },
        topics: {
          type: 'array',
          maxItems: MAX_TOPIC_SEARCH_TERMS,
          items: topicReferenceSchema,
          description: 'Up to five topic/#hashtag terms.',
        },
        sort: {
          type: 'string',
          enum: [...RSS_FEED_SORTS],
          description: 'trending ranks the most followed and most active feeds in time_range.',
        },
        time_range: {
          type: 'string',
          enum: [...RSS_FEED_TIME_RANGES],
          description: 'The trending window. Defaults to week. Only with sort=trending.',
        },
        limit: { type: 'integer', minimum: 1, description: 'Defaults to 25; clamped to 25.' },
        after: { type: 'string' },
      },
      required: [],
    },
  },
  meta: {
    audience: 'user',
    title: 'Search RSS Feeds',
    plan: 'free',
    requiredScopes: ['rss-feeds:read'],
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
      validateTopicSearchTerms(args, ['topic', 'topics'], true)
      const page = await findPageOrNull(args.after, async () => {
        const topics = await resolvedTopicFilters({ topic: args.topic, topics: args.topics })
        if (!topics) return { results: [], page_info: EMPTY_PAGE_INFO }
        const prepared = prepareRssFeedsSearchParams({
          q: args.q,
          text_search_query: args.text_search_query,
          feed_type: args.feed_type,
          enabled: args.enabled === undefined ? undefined : String(args.enabled),
          discoverable: args.discoverable === undefined ? undefined : String(args.discoverable),
          category: args.category,
          include_descendants: args.include_descendants,
          publisher_type: args.publisher_type,
          publisher_type_match: args.publisher_type_match,
          publisher_types: args.publisher_types,
          topic: topics.topic,
          topic_match: args.topic_match,
          topics: topics.topics,
          sort: args.sort,
          time_range: args.time_range,
        })
        const { shouldReturnEmpty, searchOptions } = await resolveRssFeedsSearchParams(prepared)
        if (shouldReturnEmpty) return { results: [], page_info: EMPTY_PAGE_INFO }
        if (args.after && searchOptions.text_search_query) return null
        const cursor = decodeRssFeedsCursor(args.after, searchOptions.sort)
        const limit = clampToolLimit(args.limit, MAX_LIMIT, MAX_LIMIT)
        const rows = await searchRssFeeds({
          ...searchOptions,
          limit: limit + 1,
          ...cursor,
          ...(args.apply_mutes ? { current_user_id: currentUser.id } : {}),
        })
        const { feeds, page_info } = buildRssFeedsPage(rows, {
          limit,
          sort: searchOptions.sort,
          hasTextSearch: !!searchOptions.text_search_query,
        })
        return { results: await toMcpRssFeeds(feeds), page_info }
      })
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, ...page }
    },
}

export const getRssFeedTool: MergedToolSource<DetailArgs, DetailResult> = {
  schema: {
    description:
      'Get an RSS feed by UUID, including disabled or non-discoverable feeds as the REST detail route does.',
    parameters: {
      type: 'object',
      properties: { rss_feed_id: rssFeedReferenceSchema },
      required: ['rss_feed_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get RSS Feed',
    plan: 'free',
    requiredScopes: ['rss-feeds:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feeds/:id' }],
    outputSchema: foundOrNotFoundSchema({ rss_feed: mcpRssFeedSchema() }),
  },
  function:
    (_currentUser: BasicUser) =>
    async ({ rss_feed_id }: DetailArgs): Promise<DetailResult> => {
      const feedId = await canonicalEntityId('rss_feed', rss_feed_id)
      if (!feedId) return { success: false, error: 'RSS feed not found' }
      const feed = await getRssFeedByIdCached(feedId)
      if (!feed) return { success: false, error: 'RSS feed not found' }
      const [rssFeed] = await toMcpRssFeeds([feed as ViewRssFeed])
      return { success: true, rss_feed: rssFeed! }
    },
}
