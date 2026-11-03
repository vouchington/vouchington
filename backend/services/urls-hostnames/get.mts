import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ViewHostname } from './types.mts'
import sql from 'sql-template-strings'
import { getUrlHostnamesByAnyBatch } from './get-batch.mts'

export const getUrlHostnameByAny = async (id: string): Promise<ViewHostname | null> =>
  (await getUrlHostnamesByAnyBatch([id]))[0]

type UrlHostnameCrawlerDetails = {
  id: string
  hostname: string
  is_blocked: boolean
  is_crawlable: boolean
  age_threshold_days: number
  requests_per_second_limit: number | null
  attempt_threshold_hours: number | null
  network_backoff_step: number
  network_backoff_ends_at: Date | null
}

export const getUrlHostnameCrawlerDetailsById = async (
  id: string,
  options: QueryOptions = {},
): Promise<UrlHostnameCrawlerDetails | null> => {
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery<UrlHostnameCrawlerDetails>(
    sql`/* getUrlHostnameCrawlerDetailsById */
    SELECT
      id,
      hostname,
      is_blocked,
      is_crawlable,
      age_threshold_days,
      requests_per_second_limit,
      attempt_threshold_hours,
      network_backoff_step,
      network_backoff_ends_at
    FROM url_hostnames
    WHERE id = ${id}
    LIMIT 1
  `,
    undefined,
    options,
  )
  return rows[0] || null
}
