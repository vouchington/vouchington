import { isUUID, normalizeUrlForUrlTable } from '@modules/utils'
import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ViewUrl } from './types.mts'
import createHttpError from 'http-errors'
import { caches } from '@services/entity-cache/caches'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'

export const getUrlById = async (
  id: string,
  options: QueryOptions = {},
): Promise<ViewUrl | null> => {
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery<ViewUrl>(
    `/* getUrlById */
    SELECT * FROM view_urls
    WHERE id = $1
    LIMIT 1
  `,
    [id],
    options,
  )
  return rows[0] || null
}

export const getUrlsByIds = async (
  ids: string[],
  options: QueryOptions = {},
): Promise<ViewUrl[]> => {
  if (ids.length === 0) return []
  const { rows } = await read<ViewUrl>(
    `/* getUrlsByIds */
    SELECT * FROM view_urls
    WHERE id = ANY($1::uuid[])
  `,
    [ids],
    options,
  )
  return rows
}

export const getUrlByAny = async (
  id: string,
  options: QueryOptions = {},
): Promise<ViewUrl | null> => {
  let filter: string
  let param: string
  if (isUUID(id)) {
    filter = 'id = $1'
    param = id
  } else {
    try {
      // Normalize the URL to match URL-table storage: http upgrades, fragments strip,
      // and URL parser canonicalization such as host lowercasing/trailing origin slash.
      const url = normalizeUrlForUrlTable(id)
      param = url.toString()
      filter = 'url = $1'
    } catch (err) {
      throw createHttpError(422, 'Invalid URL identifier: must be a UUID or a valid URL', {
        cause: err,
      })
    }
  }
  const { rows } = await read<ViewUrl>(
    `/* getUrlByAny */
    WITH url_id AS (
      SELECT id
      FROM urls
      WHERE ${filter}
      LIMIT 1
    )
    SELECT view_urls.* FROM view_urls
    JOIN url_id ON url_id.id = view_urls.id
    LIMIT 1
  `,
    [param],
    options,
  )
  return rows[0] || null
}

const getCachedUrl = caches.urls.cacheGetByAny(getUrlByAny)
const getCachedHostname = caches.url_hostnames.cacheGetByAny(getUrlHostnameByAny)

/** Keep URL identity cached while reading mutable hostname policy from its own cache. */
export async function getUrlByAnyCached(id: string): Promise<ViewUrl | null> {
  const url = await getCachedUrl(id)
  if (!url) return null
  const hostname = await getCachedHostname(url.hostname.id)
  if (!hostname) return null
  return {
    ...url,
    hostname: {
      ...url.hostname,
      is_blocked: hostname.is_blocked,
      is_crawlable: hostname.is_crawlable,
      should_skip_web_risk: hostname.should_skip_web_risk,
      should_follow_link_rel: hostname.should_follow_link_rel,
    },
  }
}
