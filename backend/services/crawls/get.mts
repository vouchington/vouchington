import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import { crawlBasicColumns, mapCrawlBasicRow } from './columns.mts'
import type { CrawlBasic } from './types.mts'

export const getCrawlById = async (
  crawlId: string,
  urlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(crawlId) || !isUUID(urlId)) {
    throw createError(422, `Invalid crawl ID or URL ID: ${crawlId}, ${urlId}`)
  }

  const { rows } = await read<Omit<CrawlBasic, '__entity_type'>>(
    `/* getCrawlById */
    SELECT ${crawlBasicColumns}
    FROM crawls
    WHERE id = $1 AND url_id = $2
    LIMIT 1
  `,
    [crawlId, urlId],
    options,
  )

  if (rows.length === 0) return null

  return mapCrawlBasicRow(rows[0])
}

export const getLatestSuccessfulCrawl = async (
  urlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }

  const { rows } = await read<Omit<CrawlBasic, '__entity_type'>>(
    `/* getLatestSuccessfulCrawl */
    SELECT ${crawlBasicColumns}
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

  return mapCrawlBasicRow(rows[0])
}

export const getLatestHtmlSnapshotCrawl = async (
  urlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }

  const { rows } = await read<Omit<CrawlBasic, '__entity_type'>>(
    `/* getLatestHtmlSnapshotCrawl */
    SELECT ${crawlBasicColumns}
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

  return mapCrawlBasicRow(rows[0])
}
