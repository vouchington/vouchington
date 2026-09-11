import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { CrawlBasic } from './types.mts'
import createError from 'http-errors'

export const getLatestHtmlSnapshotCrawlBefore = async (
  urlId: string,
  crawlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(urlId) || !isUUID(crawlId)) {
    throw createError(422, `Invalid URL ID or crawl ID: ${urlId}, ${crawlId}`)
  }

  const { rows } = await read(
    `/* getLatestHtmlSnapshotCrawlBefore */
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
      AND id <> $2
      AND response_status_code >= 200
      AND response_status_code < 300
      AND completed_at IS NOT NULL
      AND completed_at < (
        SELECT completed_at
        FROM crawls current_crawl
        WHERE current_crawl.id = $2
          AND current_crawl.url_id = $1
      )
      AND html_sha256 IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 1
  `,
    [urlId, crawlId],
    options,
  )

  if (rows.length === 0) return null

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}
