import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS, CRAWL_CLEANUP_MAX_AGE_DAYS } from '@voucha/config'
import sql from 'sql-template-strings'
import { inspectBoilerplateCrawls } from './inspect-boilerplate-crawls.mts'

type BoilerplateRemovalUrlCandidate = {
  id: string
  url: string
  crawl_id: string
}

export const searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId = async (
  hostnameId: string,
  parentPath: string,
  limit: number = 3,
  queryOptions: QueryOptions = {},
  now: () => Date = () => new Date(),
  after?: string,
  crawlAfter?: string,
): Promise<{
  candidates: BoilerplateRemovalUrlCandidate[]
  after?: string
  crawl_after?: string
}> => {
  const sampledNowMs = now().getTime()
  if (!Number.isFinite(sampledNowMs)) throw new RangeError('Invalid HTML snapshot decision time')
  const recentCutoffDate = new Date(
    sampledNowMs - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )
  const crawlIdFloor = getMinUUIDv7ForDate(
    new Date(recentCutoffDate.getTime() - CRAWL_CLEANUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000),
  )

  const { rows } = await read<
    BoilerplateRemovalUrlCandidate & { pathname: string; eligible: boolean }
  >(
    sql`/* searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId */
    SELECT u.id, u.url, u.pathname,
      EXISTS (SELECT 1 FROM url_hostnames h WHERE h.id = u.hostname_id
        AND NOT h.is_blocked AND h.is_crawlable) AS eligible
    FROM urls u
    WHERE u.hostname_id = ANY(${[hostnameId]}::uuid[])
      AND u.id >= COALESCE(${after ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (${crawlAfter ?? null}::uuid IS NOT NULL OR u.id IS DISTINCT FROM ${after ?? null}::uuid)
    ORDER BY u.hostname_id, u.id
    LIMIT ${limit}
    `,
    undefined,
    queryOptions,
  )
  const matchingRows = rows.map(row => {
    const prefix = parentPath === '/' ? '/' : `${parentPath}/`
    return {
      ...row,
      eligible:
        row.eligible &&
        row.pathname.startsWith(prefix) &&
        !row.pathname.slice(prefix.length).includes('/'),
    }
  })
  const inspection = await inspectBoilerplateCrawls(matchingRows, limit, {
    cutoff: recentCutoffDate,
    floor: crawlIdFloor,
    crawlAfter: rows[0]?.id === after ? crawlAfter : undefined,
    queryOptions,
  })
  const eligibleIds = new Map(
    inspection.eligibleCrawls.map(crawl => [crawl.url_id, crawl.crawl_id]),
  )
  const candidates: BoilerplateRemovalUrlCandidate[] = []
  for (const row of rows) {
    const crawlId = eligibleIds.get(row.id)
    if (crawlId) {
      candidates.push({ id: row.id, url: row.url, crawl_id: crawlId })
    }
  }
  return {
    candidates,
    after: rows.length === limit || !inspection.allUrlsInspected ? inspection.lastUrlId : undefined,
    ...(inspection.crawlAfter ? { crawl_after: inspection.crawlAfter } : {}),
  }
}
