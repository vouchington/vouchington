import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { updateRssFeedById, type UpdateRssFeedChanges } from './update.mts'

const MIN_RSS_HEADER_DATE_MS = Date.UTC(1970, 0, 1)
const ISO_DATE_YEAR_PATTERN = /^([+-]?\d{4,6})-\d{2}-\d{2}/
const RFC_822_DATE_YEAR_PATTERN = /^(?:[A-Za-z]{3},\s*)?\d{1,2}\s+[A-Za-z]{3}\s+(\d{4})(?:\s|$)/

type RssFeedCrawlSummary = {
  id: string
  response_code: number
  created_at: Date
}

export type PaidSafeRssFeedCrawl = RssFeedCrawlSummary

export function toPaidSafeRssFeedCrawl(crawl: RssFeedCrawlSummary): PaidSafeRssFeedCrawl {
  return { id: crawl.id, response_code: crawl.response_code, created_at: crawl.created_at }
}

export async function insertRssFeedCrawl(params: {
  rss_feed_id: string
  response_code: number
  feed_data?: Record<string, unknown> | null
  feed_data_sha256?: Buffer | null
  redirect_url_id?: string | null
}): Promise<string> {
  const { rows } = await write(sql`/* insertRssFeedCrawl */
    INSERT INTO rss_feed_crawls (rss_feed_id, response_code, feed_data, feed_data_sha256, redirect_url_id)
    VALUES (${params.rss_feed_id}, ${params.response_code}, ${params.feed_data ?? null}, ${params.feed_data_sha256 ?? null}, ${params.redirect_url_id ?? null})
    RETURNING id
  `)
  return rows[0]!.id
}

export async function getLatestRssFeedCrawlForFeed(rss_feed_id: string): Promise<{
  feed_data: Record<string, unknown> | null
  feed_data_sha256: Buffer | null
} | null> {
  return getLatestRssFeedCrawlForFeedWithOptions(rss_feed_id, { includeFeedData: true })
}

export async function getLatestRssFeedCrawlForFeedWithOptions(
  rss_feed_id: string,
  options: { includeFeedData: boolean },
): Promise<{
  feed_data: Record<string, unknown> | null
  feed_data_sha256: Buffer | null
} | null> {
  const feedDataColumn = options.includeFeedData ? sql`feed_data` : sql`NULL::jsonb AS feed_data`
  const { rows } = await read(
    sql`/* getLatestRssFeedCrawlForFeed */ SELECT `.append(feedDataColumn)
      .append(sql`, feed_data_sha256
        FROM rss_feed_crawls
        WHERE rss_feed_id = ${rss_feed_id}
          AND id > ${rss_feed_id} -- UUIDv7 partition pruning
          AND feed_data_sha256 IS NOT NULL
          AND feed_data IS NOT NULL
        ORDER BY id DESC
        LIMIT 1`),
  )
  const row = rows[0]
  return row
    ? { feed_data: row.feed_data ?? null, feed_data_sha256: row.feed_data_sha256 ?? null }
    : null
}

function buildRssFeedMetadataChanges(headers: {
  etag: string | null
  lastModified: string | null
}): UpdateRssFeedChanges {
  const changes: UpdateRssFeedChanges = {}
  if (headers.etag != null) changes.etag = headers.etag
  const lastModifiedAt = parseRssLastModifiedHeader(headers.lastModified)
  if (lastModifiedAt != null) changes.last_modified_at = lastModifiedAt
  return changes
}

export function parseRssLastModifiedHeader(lastModified: string | null): Date | null {
  if (lastModified == null || lastModified.trim() === '') return null

  const trimmed = lastModified.trim()
  const knownYear = getKnownDateYear(trimmed)
  if (knownYear !== null && knownYear < 1970) return null

  const parsed = new Date(trimmed)
  const parsedMs = parsed.getTime()
  if (!Number.isFinite(parsedMs) || parsedMs < MIN_RSS_HEADER_DATE_MS) return null

  return parsed
}

export async function persistRssFeedCrawlAndMetadata(params: {
  rssFeedId: string
  responseCode: number
  headers: { etag: string | null; lastModified: string | null }
  feedData?: Record<string, unknown> | null
  feedDataSha256?: Buffer | null
  redirectUrlId?: string | null
}): Promise<void> {
  await insertRssFeedCrawl({
    rss_feed_id: params.rssFeedId,
    response_code: params.responseCode,
    feed_data: params.feedData,
    feed_data_sha256: params.feedDataSha256,
    redirect_url_id: params.redirectUrlId,
  })
  await updateRssFeedById(params.rssFeedId, {
    ...buildRssFeedMetadataChanges(params.headers),
    last_fetched_at: true,
  })
}

export type RssFeedCrawlDetail = {
  id: string
  response_code: number
  created_at: Date
  feed_data: Record<string, unknown> | null
  feed_data_sha256: Buffer | null
  redirect_url_id: string | null
}

export async function getRssFeedCrawlById(
  rssFeedId: string,
  crawlId: string,
): Promise<RssFeedCrawlDetail | null> {
  const { rows } = await read(
    sql`/* getRssFeedCrawlById */ SELECT id, response_code, uuid_extract_timestamp(id) AS created_at,
        feed_data, feed_data_sha256, redirect_url_id
        FROM rss_feed_crawls
        WHERE rss_feed_id = ${rssFeedId}
          AND id = ${crawlId}
        LIMIT 1`,
  )
  const row = rows[0]
  return row ? (row as RssFeedCrawlDetail) : null
}

export async function getRssFeedCrawlSummaryById(
  rssFeedId: string,
  crawlId: string,
): Promise<RssFeedCrawlSummary | null> {
  const { rows } = await read(
    sql`/* getRssFeedCrawlSummaryById */ SELECT id, response_code, uuid_extract_timestamp(id) AS created_at
        FROM rss_feed_crawls
        WHERE rss_feed_id = ${rssFeedId}
          AND id = ${crawlId}
        LIMIT 1`,
  )
  return (rows[0] as RssFeedCrawlSummary | undefined) ?? null
}

export async function searchRssFeedCrawls(
  rss_feed_id: string,
  options: { after?: string; limit?: number } = {},
): Promise<{ results: RssFeedCrawlSummary[]; page_info: PageInfo }> {
  const limit = options.limit ?? 10
  const cursorScope = `rss-feed:${rss_feed_id}:crawls`
  const after = options.after
    ? decodeScopedUuidCursor(options.after, cursorScope, 'Invalid RSS feed crawl cursor')
    : null
  const query = sql`/* searchRssFeedCrawls */ SELECT id, response_code, uuid_extract_timestamp(id) AS created_at
        FROM rss_feed_crawls
        WHERE rss_feed_id = ${rss_feed_id}
        AND id > ${rss_feed_id} -- UUIDv7 partition pruning
  `
  if (after) query.append(sql` AND id < ${after.id}`)
  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)
  const { rows } = await read(query)
  const crawls = rows as RssFeedCrawlSummary[]
  const results = crawls.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: crawls.length > limit,
      getCursor: crawl => ({ id: crawl.id, scope: cursorScope }),
    }),
  }
}

function getKnownDateYear(value: string): number | null {
  const isoYear = value.match(ISO_DATE_YEAR_PATTERN)?.[1]
  if (isoYear !== undefined) return Number.parseInt(isoYear, 10)

  const year = value.match(RFC_822_DATE_YEAR_PATTERN)?.[1]
  if (year === undefined) return null
  return Number.parseInt(year, 10)
}
