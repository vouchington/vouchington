import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import { crawlBasicColumns, mapCrawlBasicRow } from './columns.mts'
import type { CrawlBasic } from './types.mts'

export const getLatestHtmlSnapshotCrawlBefore = async (
  urlId: string,
  crawlId: string,
  options: QueryOptions = {},
): Promise<CrawlBasic | null> => {
  if (!isUUID(urlId) || !isUUID(crawlId)) {
    throw createError(422, `Invalid URL ID or crawl ID: ${urlId}, ${crawlId}`)
  }

  const { rows } = await read<Omit<CrawlBasic, '__entity_type'>>(
    `/* getLatestHtmlSnapshotCrawlBefore */
    SELECT ${crawlBasicColumns}
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

  return mapCrawlBasicRow(rows[0])
}
