import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ViewHostname } from './types.mts'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'
import { isHostname } from '@ts-shared/utils/urls'

export const getUrlHostnameById = async (id: string): Promise<ViewHostname | null> => {
  const { rows } = await read(sql`/* getUrlHostnameById */
    SELECT * FROM view_url_hostnames
    WHERE id = ${id}
    LIMIT 1
  `)
  return rows[0] || null
}

export const getUrlHostnameByAny = async (id: string): Promise<ViewHostname | null> => {
  const normalized = id.trim().toLowerCase()
  if (isUUID(normalized)) return getUrlHostnameById(normalized)
  if (isHostname(normalized)) {
    const { rows } = await read(sql`/* getUrlHostnameByAny */
      SELECT * FROM view_url_hostnames
      WHERE hostname = ${normalized}
      LIMIT 1
    `)
    return rows[0] || null
  }
  throw createHttpError(422, 'Invalid URL hostname identifier: must be a UUID or a valid hostname')
}

type UrlHostnameCrawlerDetails = {
  id: string
  hostname: string
  blocked: boolean | null
  crawlable: boolean | null
  age_threshold_days: number | null
  requests_per_second_limit: number | null
  attempt_threshold_hours: number | null
}

export const getUrlHostnameCrawlerDetailsById = async (
  id: string,
  options: QueryOptions = {},
): Promise<UrlHostnameCrawlerDetails | null> => {
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery(
    sql`/* getUrlHostnameCrawlerDetailsById */
    SELECT
      id,
      hostname,
      blocked,
      crawlable,
      age_threshold_days,
      requests_per_second_limit,
      attempt_threshold_hours
    FROM url_hostnames
    WHERE id = ${id}
    LIMIT 1
  `,
    undefined,
    options,
  )
  return rows[0] || null
}
