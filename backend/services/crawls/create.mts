import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { CreateCrawlOptions, CrawlBasic } from './types.mts'
import createError from 'http-errors'

export const createCrawl = async (
  urlId: string,
  crawlerId: string,
  options: Omit<CreateCrawlOptions, 'url_id' | 'hostname_crawler_configuration_id'> = {},
  queryOptions: QueryOptions = {},
): Promise<CrawlBasic> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }
  if (!isUUID(crawlerId)) {
    throw createError(422, `Invalid crawler ID: ${crawlerId}`)
  }

  const { rows } = await write<Omit<CrawlBasic, '__entity_type'>>(
    `/* createCrawl */
    INSERT INTO crawls (
      url_id,
      hostname_crawler_configuration_id,
      last_modified_at,
      etag,
      request_headers,
      response_headers,
      response_status_code,
      markdown
    )
    VALUES ($1, $2, $3, $4, '{}'::jsonb, '{}'::jsonb, 200, '')
    RETURNING url_id, id, created_at, hostname_crawler_configuration_id, last_modified_at, etag,
      html_sha256, html_snapshot_uploaded_at, request_headers, response_headers,
      response_status_code, redirect_url_id, network_error, completed_at, has_pending_embeddings,
      embeddings_generated_at, markdown, title, links, meta_tags, embed_metadata,
      embed_oembed_url, embed_oembed_resolved_at, language
  `,
    [urlId, crawlerId, options.last_modified_at || null, options.etag || null],
    queryOptions,
  )

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}
