import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { isUUID } from '@modules/utils'
import { getRssFeedByIdCached } from '@services/entity-fetch'
import { getMembershipByUserId } from '@services/memberships'
import {
  getRssFeedCrawlById,
  getRssFeedCrawlSummaryById,
  searchRssFeedCrawls,
} from '@services/rss-feeds/crawls'
import {
  currentUserCanRefreshRssFeed,
  currentUserCanViewLatestRssFeedCrawl,
} from '@services/rss-feeds/authorization'
import type { BasicUser, PrivateUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import createHttpError from 'http-errors'
import { requirePrivateToolUser } from './private-user.mts'
import { pageInfoSchema } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT } from './paged-search.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ListArgs = { rss_feed_id: string; limit?: number; after?: string }
type DetailArgs = { rss_feed_id: string; crawl_id: string }
type Summary = { id: string; response_code: number; created_at: string }
type Detail = Summary & {
  feed_data: string | null
  feed_data_sha256: string | null
  redirect_url_id: string | null
}
type ListResult =
  | {
      success: true
      results: Summary[]
      page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
    }
  | { success: false; error: string }
type DetailResult = { success: true; crawl: Summary | Detail } | { success: false; error: string }
const MAX_LIMIT = 100
const summarySchema = closedObject(
  pickProperties('RssFeedCrawlSummary', ['id', 'response_code', 'created_at']),
)
const detailSchema = closedObject({
  ...pickProperties('RssFeedCrawlDetail', ['id', 'response_code', 'created_at', 'redirect_url_id']),
  feed_data: { type: ['string', 'null'] },
  feed_data_sha256: { type: ['string', 'null'] },
})

async function requireCrawlViewer(currentUser: BasicUser): Promise<PrivateUser> {
  const viewer = await requirePrivateToolUser(currentUser)
  const membership = currentUserCanRefreshRssFeed(viewer)
    ? null
    : await getMembershipByUserId(viewer.id)
  if (!currentUserCanViewLatestRssFeedCrawl(viewer, membership)) {
    throw createHttpError(403, 'Premium membership required')
  }
  return viewer
}

function toSummary(row: { id: string; response_code: number; created_at: Date }): Summary {
  return {
    id: row.id,
    response_code: row.response_code,
    created_at: new Date(row.created_at).toISOString(),
  }
}

export const listRssFeedCrawlsTool: Tool<ListArgs, ListResult> = {
  schema: {
    name: 'list_rss_feed_crawls',
    type: 'function',
    description:
      'List crawl summaries for an RSS feed. REST requires a premium membership or administrator role. Returns at most 100 per page with page_info.end_cursor for the next page.',
    parameters: {
      type: 'object',
      properties: {
        rss_feed_id: { type: 'string', format: 'uuid' },
        limit: { type: 'integer', minimum: 1, description: 'Defaults to 50; clamped to 100.' },
        after: { type: 'string' },
      },
      required: ['rss_feed_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'List RSS Feed Crawls',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feeds/:id/crawls' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: summarySchema },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ListArgs): Promise<ListResult> => {
      await requireCrawlViewer(currentUser)
      if (!isUUID(args.rss_feed_id) || !(await getRssFeedByIdCached(args.rss_feed_id))) {
        return { success: false, error: 'RSS feed not found' }
      }
      const page = await findPageOrNull(args.after, () =>
        searchRssFeedCrawls(args.rss_feed_id, {
          limit: clampToolLimit(args.limit, 50, MAX_LIMIT),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, results: page.results.map(toSummary), page_info: page.page_info }
    },
}

export const getRssFeedCrawlTool: Tool<DetailArgs, DetailResult> = {
  schema: {
    name: 'get_rss_feed_crawl',
    type: 'function',
    description:
      'Get one RSS feed crawl. Premium callers receive only the REST paid summary; administrators may also receive raw feed data, fenced as external content.',
    parameters: {
      type: 'object',
      properties: {
        rss_feed_id: { type: 'string', format: 'uuid' },
        crawl_id: { type: 'string', format: 'uuid' },
      },
      required: ['rss_feed_id', 'crawl_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get RSS Feed Crawl',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [
      { method: 'GET', path: '/api/v1/rss-feeds/:id/crawls/:crawlId#paid' },
      { method: 'GET', path: '/api/v1/rss-feeds/:id/crawls/:crawlId#privileged' },
    ],
    outputSchema: foundOrNotFoundSchema({ crawl: { oneOf: [summarySchema, detailSchema] } }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: DetailArgs): Promise<DetailResult> => {
      const viewer = await requireCrawlViewer(currentUser)
      if (!isUUID(args.rss_feed_id) || !isUUID(args.crawl_id)) {
        return { success: false, error: 'Crawl not found' }
      }
      if (!(await getRssFeedByIdCached(args.rss_feed_id))) {
        return { success: false, error: 'RSS feed not found' }
      }
      if (!currentUserCanRefreshRssFeed(viewer)) {
        const crawl = await getRssFeedCrawlSummaryById(args.rss_feed_id, args.crawl_id)
        return crawl
          ? { success: true, crawl: toSummary(crawl) }
          : { success: false, error: 'Crawl not found' }
      }
      const crawl = await getRssFeedCrawlById(args.rss_feed_id, args.crawl_id)
      if (!crawl) return { success: false, error: 'Crawl not found' }
      return {
        success: true,
        crawl: {
          ...toSummary(crawl),
          feed_data: crawl.feed_data
            ? wrapExternalContent(await sanitizePromptInjection(JSON.stringify(crawl.feed_data)), {
                source: 'rss_feed',
                contentType: 'crawl_data',
              })
            : null,
          feed_data_sha256: crawl.feed_data_sha256?.toString('hex') ?? null,
          redirect_url_id: crawl.redirect_url_id,
        },
      }
    },
}

export const rssFeedCrawlReadTools = [listRssFeedCrawlsTool, getRssFeedCrawlTool]
