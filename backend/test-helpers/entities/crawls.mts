/**
 * Crawls test verification helpers
 */

import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CrawlerHtmlStructuredObject } from '@voucha/types/entities/crawl'

/**
 * Count crawls for a URL
 */
export async function countCrawlsForUrl(urlId: string): Promise<number> {
  const { rows } = await read(sql`
    SELECT COUNT(*)::int as count
    FROM crawls
    WHERE url_id = ${urlId}
  `)
  return rows[0].count
}

/**
 * Get crawl data (used after updates to refresh the object)
 */
export async function getCrawlData(urlId: string, crawlId: string): Promise<unknown> {
  const { rows } = await read(sql`
    SELECT * FROM crawls
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
  return rows[0]
}

/**
 * Check if crawl has pending embeddings
 */
export async function crawlHasPendingEmbeddings(urlId: string, crawlId: string): Promise<boolean> {
  const { rows } = await read(sql`
    SELECT has_pending_embeddings
    FROM crawls
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
  return rows[0]?.has_pending_embeddings || false
}

/**
 * Insert a bare "just crawled" crawl row associated with a crawler — matches the shape
 * produced by the real `createCrawl` service call (crawler_id set, response_status_code
 * 200, empty markdown, no completed_at/embeddings_generated_at). Use this for tests that
 * need a freshly-created, still-pending crawl; use `insertTestCrawl` when the test needs a
 * crawl that already looks "finalized" for search.
 */
export async function insertTestCrawlPending(
  urlId: string,
  crawlerId: string,
): Promise<{ id: string }> {
  const { rows } = await write(sql`
    INSERT INTO crawls (
      url_id,
      crawler_id,
      request_headers,
      response_headers,
      response_status_code,
      markdown
    )
    VALUES (
      ${urlId},
      ${crawlerId},
      '{}'::jsonb,
      '{}'::jsonb,
      200,
      ''
    )
    RETURNING id
  `)
  return { id: rows[0].id }
}

/**
 * Insert a test crawl
 *
 * Sets completed_at, embeddings_generated_at, and network_error to make the crawl
 * valid for search filtering by default. Pass completedAt to override the
 * completed_at timestamp (e.g. to backdate a crawl for retention-window tests),
 * and htmlSha256 to mark the crawl as having a stored HTML snapshot.
 * If id is not provided, PostgreSQL will generate a UUIDv7 automatically.
 */
export async function insertTestCrawl(data: {
  id?: string
  urlId: string
  statusCode: number
  markdown: string
  title?: string
  metaTags?: CrawlerHtmlStructuredObject
  completedAt?: Date
  htmlSha256?: Buffer
  htmlSnapshotUploadedAt?: Date
  embedMetadata?: unknown
  embedOEmbedUrl?: string | null
  embedOEmbedResolvedAt?: Date | null
}): Promise<{ id: string }> {
  const hasId = data.id !== undefined

  const query = sql`INSERT INTO crawls (`
  if (hasId) {
    query.append(sql`id, `)
  }
  query.append(sql`
    url_id,
    response_status_code,
    markdown,
    completed_at,
    embeddings_generated_at,
    network_error
  `)
  if (data.title !== undefined) {
    query.append(sql`, title`)
  }
  if (data.metaTags !== undefined) {
    query.append(sql`, meta_tags`)
  }
  if (data.htmlSha256 !== undefined) {
    query.append(sql`, html_sha256`)
  }
  if (data.htmlSnapshotUploadedAt !== undefined) {
    query.append(sql`, html_snapshot_uploaded_at`)
  }
  if (data.embedMetadata !== undefined) {
    query.append(sql`, embed_metadata`)
  }
  if (data.embedOEmbedUrl !== undefined) {
    query.append(sql`, embed_oembed_url`)
  }
  if (data.embedOEmbedResolvedAt !== undefined || data.embedMetadata !== undefined) {
    query.append(sql`, embed_oembed_resolved_at`)
  }
  query.append(sql`) VALUES (`)
  if (hasId) {
    query.append(sql`${data.id}, `)
  }
  query.append(sql`
    ${data.urlId},
    ${data.statusCode},
    ${data.markdown},
    ${data.completedAt ?? new Date()},
    NOW(),
    NULL
  `)
  if (data.title !== undefined) {
    query.append(sql`, ${data.title}`)
  }
  if (data.metaTags !== undefined) {
    query.append(sql`, ${JSON.stringify(data.metaTags)}`)
  }
  if (data.htmlSha256 !== undefined) {
    query.append(sql`, ${data.htmlSha256}`)
  }
  if (data.htmlSnapshotUploadedAt !== undefined) {
    query.append(sql`, ${data.htmlSnapshotUploadedAt}`)
  }
  if (data.embedMetadata !== undefined) {
    query.append(sql`, ${JSON.stringify(data.embedMetadata)}`)
  }
  if (data.embedOEmbedUrl !== undefined) {
    query.append(sql`, ${data.embedOEmbedUrl}`)
  }
  if (data.embedOEmbedResolvedAt !== undefined || data.embedMetadata !== undefined) {
    const resolvedAt =
      data.embedOEmbedResolvedAt !== undefined
        ? data.embedOEmbedResolvedAt
        : data.embedOEmbedUrl
          ? null
          : new Date()
    query.append(sql`, ${resolvedAt}`)
  }
  query.append(sql`)
  RETURNING id
  `)

  const result = await write(query)
  return { id: result.rows[0].id }
}
