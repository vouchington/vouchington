import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { CrawlBasic } from './types.mts'
import createError from 'http-errors'

export const getCrawlById = async (
  crawlId: string,
  urlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(crawlId) || !isUUID(urlId)) {
    throw createError(422, `Invalid crawl ID or URL ID: ${crawlId}, ${urlId}`)
  }

  const { rows } = await read(
    `/* getCrawlById */
    SELECT
      id,
      url_id,
      crawler_id,
      created_at,
      last_modified_at,
      etag,
      html_sha256,
      html_snapshot_uploaded_at,
      request_headers,
      response_headers,
      response_status_code,
      redirect_url_id,
      network_error,
      completed_at,
      embeddings_generated_at,
      has_pending_embeddings,
      markdown,
      title,
      links,
      meta_tags,
      embed_metadata,
      embed_oembed_url,
      embed_oembed_resolved_at,
      lang
    FROM crawls
    WHERE id = $1 AND url_id = $2
    LIMIT 1
  `,
    [crawlId, urlId],
    options,
  )

  if (rows.length === 0) return null

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}

export const getLatestSuccessfulCrawl = async (
  urlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }

  const { rows } = await read(
    `/* getLatestSuccessfulCrawl */
    SELECT
      id,
      url_id,
      crawler_id,
      created_at,
      last_modified_at,
      etag,
      html_sha256,
      html_snapshot_uploaded_at,
      request_headers,
      response_headers,
      response_status_code,
      redirect_url_id,
      network_error,
      completed_at,
      embeddings_generated_at,
      has_pending_embeddings,
      markdown,
      title,
      links,
      meta_tags,
      embed_metadata,
      embed_oembed_url,
      embed_oembed_resolved_at,
      lang
    FROM crawls
    WHERE url_id = $1
      AND embeddings_generated_at IS NOT NULL
    ORDER BY embeddings_generated_at DESC
    LIMIT 1
  `,
    [urlId],
    options,
  )

  if (rows.length === 0) return null

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}

export const getLatestHtmlSnapshotCrawl = async (
  urlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }

  const { rows } = await read(
    `/* getLatestHtmlSnapshotCrawl */
    SELECT
      id,
      url_id,
      crawler_id,
      created_at,
      last_modified_at,
      etag,
      html_sha256,
      html_snapshot_uploaded_at,
      request_headers,
      response_headers,
      response_status_code,
      redirect_url_id,
      network_error,
      completed_at,
      embeddings_generated_at,
      has_pending_embeddings,
      markdown,
      title,
      links,
      meta_tags,
      embed_metadata,
      embed_oembed_url,
      embed_oembed_resolved_at,
      lang
    FROM crawls
    WHERE url_id = $1
      AND completed_at IS NOT NULL
      AND html_sha256 IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 1
  `,
    [urlId],
    options,
  )

  if (rows.length === 0) return null

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}
