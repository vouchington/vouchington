import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getMinUUIDv7ForParentHistory, getMaxUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { getOrCreateCrawlerForHostname } from './get-or-create.mts'
import { getRetryCrawlUrlCount } from './refresh-limits.mts'

export type HostnameCrawlerRefreshCursor = { sweepStartedAt: string; afterId?: string }

type CrawlerRefreshCandidateUrl = {
  id: string
  url: string
}

export const searchHostnameIdsNeedingCrawlerRefresh = async (
  limit: number,
  queryOptions: QueryOptions = {},
  hostnameId?: string,
  cursor?: HostnameCrawlerRefreshCursor,
): Promise<string[]> => {
  const query = sql`/* searchHostnameIdsNeedingCrawlerRefresh */
    SELECT h.id
    FROM url_hostnames h
    LEFT JOIN hostname_crawler_configurations c
      ON c.hostname_id = h.id
      AND c.deleted_at IS NULL
    WHERE NOT h.is_blocked
      AND h.is_crawlable
  `
  if (hostnameId) query.append(sql` AND h.id = ${hostnameId}::uuid`)
  if (cursor?.afterId) query.append(sql` AND h.id > ${cursor.afterId}::uuid`)
  const sweepStartedAt = cursor?.sweepStartedAt ?? new Date().toISOString()
  if (cursor) {
    const sweepMaxId = getMaxUUIDv7ForDate(new Date(sweepStartedAt))
    query.append(sql` AND h.id <= ${sweepMaxId}::uuid`)
  }
  query.append(sql`
    GROUP BY h.id
    HAVING (
      NOT EXISTS (
        SELECT 1 FROM hostname_crawler_configurations existing_crawler
        WHERE existing_crawler.hostname_id = h.id AND existing_crawler.deleted_at IS NULL
      )
      OR MAX(c.updated_at) < date_trunc('week', ${sweepStartedAt}::timestamptz)
    )
    ORDER BY h.id ASC
    LIMIT ${limit}
  `)
  const { rows } = await read(query, undefined, queryOptions)

  return rows.map(row => row.id)
}

export const searchCrawlerRefreshUrlCandidatesByHostnameId = async (
  hostnameId: string,
  limit: number = 3,
  queryOptions: QueryOptions = {},
  excludeUrlIds: string[] = [],
): Promise<CrawlerRefreshCandidateUrl[]> => {
  const minCrawlId = getMinUUIDv7ForParentHistory(hostnameId)
  const query = sql`/* searchCrawlerRefreshUrlCandidatesByHostnameId */
    SELECT u.id, u.url
    FROM urls u
    LEFT JOIN crawls c ON c.url_id = u.id AND c.id >= ${minCrawlId}::uuid
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE u.hostname_id = ${hostnameId}
      AND NOT h.is_blocked
      AND h.is_crawlable
  `
  if (excludeUrlIds.length > 0) {
    query.append(sql` AND NOT (u.id = ANY(${excludeUrlIds}::UUID[]))`)
  }
  query.append(
    sql` GROUP BY u.id, u.url ORDER BY MAX(uuid_extract_timestamp(c.id)) ASC NULLS FIRST LIMIT ${limit}`,
  )

  const { rows } = await read<CrawlerRefreshCandidateUrl>(query, undefined, queryOptions)

  return rows
}

type RefreshHostnameCrawlerResult = {
  hostname_id: string
  hostname_crawler_configuration_id: string | null
  urls_considered: number
  urls_selected_for_crawl: number
  url_ids_to_crawl: string[]
}

export async function refreshHostnameCrawler(
  hostnameId: string,
): Promise<RefreshHostnameCrawlerResult> {
  const hostname = await getUrlHostnameCrawlerDetailsById(hostnameId)
  if (!hostname || hostname.is_blocked || !hostname.is_crawlable) {
    return {
      hostname_id: hostnameId,
      hostname_crawler_configuration_id: null,
      urls_considered: 0,
      urls_selected_for_crawl: 0,
      url_ids_to_crawl: [],
    }
  }

  const crawler = await getOrCreateCrawlerForHostname(null, hostname.id)

  const urls = await searchCrawlerRefreshUrlCandidatesByHostnameId(
    hostnameId,
    getRetryCrawlUrlCount(),
  )
  if (urls.length < 2) {
    return {
      hostname_id: hostnameId,
      hostname_crawler_configuration_id: crawler.id,
      urls_considered: urls.length,
      urls_selected_for_crawl: 0,
      url_ids_to_crawl: [],
    }
  }

  const urlIdsToCrawl = urls.map(url => url.id)
  return {
    hostname_id: hostnameId,
    hostname_crawler_configuration_id: crawler.id,
    urls_considered: urls.length,
    urls_selected_for_crawl: urlIdsToCrawl.length,
    url_ids_to_crawl: urlIdsToCrawl,
  }
}
