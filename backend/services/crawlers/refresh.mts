import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { getOrCreateCrawlerForHostname } from './create-crawler.mts'

type CrawlerRefreshCandidateUrl = {
  id: string
  url: string
}

export const searchHostnameIdsNeedingCrawlerRefresh = async (
  limit: number,
  queryOptions: QueryOptions = {},
): Promise<string[]> => {
  const { rows } = await read(
    sql`/* searchHostnameIdsNeedingCrawlerRefresh */
    SELECT h.id
    FROM url_hostnames h
    LEFT JOIN crawlers c
      ON c.hostname_id = h.id
      AND c.deleted_at IS NULL
    WHERE (h.blocked IS NULL OR h.blocked = false)
      AND (h.crawlable IS NULL OR h.crawlable = true)
    GROUP BY h.id
    HAVING (
      COUNT(c.id) = 0
      OR MAX(c.updated_at) < date_trunc('week', CURRENT_TIMESTAMP)
    )
    ORDER BY h.id ASC
    LIMIT ${limit}
  `,
    undefined,
    queryOptions,
  )

  return rows.map(row => row.id)
}

export const searchCrawlerRefreshUrlCandidatesByHostnameId = async (
  hostnameId: string,
  limit: number = 3,
  queryOptions: QueryOptions = {},
  excludeUrlIds: string[] = [],
): Promise<CrawlerRefreshCandidateUrl[]> => {
  const query = sql`/* searchCrawlerRefreshUrlCandidatesByHostnameId */
    SELECT u.id, u.url
    FROM urls u
    LEFT JOIN crawls c ON c.url_id = u.id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE u.hostname_id = ${hostnameId}
      AND (h.blocked IS NULL OR h.blocked = false)
      AND (h.crawlable IS NULL OR h.crawlable = true)
  `
  if (excludeUrlIds.length > 0) {
    query.append(sql` AND NOT (u.id = ANY(${excludeUrlIds}::UUID[]))`)
  }
  query.append(
    sql` GROUP BY u.id, u.url ORDER BY MAX(uuid_extract_timestamp(c.id)) ASC NULLS FIRST LIMIT ${limit}`,
  )

  const { rows } = await read(query, undefined, queryOptions)

  return rows
}

type RefreshHostnameCrawlerResult = {
  hostname_id: string
  crawler_id: string | null
  urls_considered: number
  urls_selected_for_crawl: number
  url_ids_to_crawl: string[]
}

const REFRESH_URLS_PER_HOSTNAME = 3

export async function refreshHostnameCrawler(
  hostnameId: string,
): Promise<RefreshHostnameCrawlerResult> {
  const hostname = await getUrlHostnameCrawlerDetailsById(hostnameId)
  if (!hostname || hostname.blocked || hostname.crawlable === false) {
    return {
      hostname_id: hostnameId,
      crawler_id: null,
      urls_considered: 0,
      urls_selected_for_crawl: 0,
      url_ids_to_crawl: [],
    }
  }

  const crawler = await getOrCreateCrawlerForHostname(null, hostname.id)

  const urls = await searchCrawlerRefreshUrlCandidatesByHostnameId(
    hostnameId,
    REFRESH_URLS_PER_HOSTNAME,
  )
  if (urls.length < 2) {
    return {
      hostname_id: hostnameId,
      crawler_id: crawler.id,
      urls_considered: urls.length,
      urls_selected_for_crawl: 0,
      url_ids_to_crawl: [],
    }
  }

  const urlIdsToCrawl = urls.map(url => url.id)
  return {
    hostname_id: hostnameId,
    crawler_id: crawler.id,
    urls_considered: urls.length,
    urls_selected_for_crawl: urlIdsToCrawl.length,
    url_ids_to_crawl: urlIdsToCrawl,
  }
}
