import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import type { PaidSafeUrlCrawlHistory } from './public-url-response.mts'

export const getPublicUrlCrawlDetailById = async (
  crawlId: string,
  urlId: string,
  options: QueryOptions = {},
): Promise<PaidSafeUrlCrawlHistory | null> => {
  if (!isUUID(crawlId) || !isUUID(urlId)) {
    throw createError(422, `Invalid crawl ID or URL ID: ${crawlId}, ${urlId}`)
  }

  const { rows } = await read(
    `/* getPublicUrlCrawlDetailById */
    SELECT id, created_at, response_status_code, completed_at, title, lang
    FROM crawls
    WHERE id = $1 AND url_id = $2
    LIMIT 1
  `,
    [crawlId, urlId],
    options,
  )

  if (rows.length === 0) return null

  return { __entity_type: 'crawl', ...rows[0] }
}

export const getLatestSuccessfulPublicUrlCrawlSummary = async (
  urlId: string,
  options: QueryOptions = {},
): Promise<PaidSafeUrlCrawlHistory | null> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }

  const { rows } = await read(
    `/* getLatestSuccessfulPublicUrlCrawlSummary */
    SELECT id, created_at, response_status_code, completed_at, title, lang
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

  return { __entity_type: 'crawl', ...rows[0] }
}
