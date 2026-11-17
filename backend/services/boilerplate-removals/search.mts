import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getMaxUuidv7ForDate, getMinUuidv7ForDate } from '@modules/utils'
import {
  CRAWL_HTML_SNAPSHOT_RETENTION_DAYS,
  CRAWL_CLEANUP_MAX_AGE_DAYS,
} from '@services/crawls/constants'
import sql from 'sql-template-strings'
import { inspectBoilerplateCrawls } from '@services/crawlers/inspect-boilerplate-crawls'

export type ParentPathCandidate = {
  hostname_id: string
  parent_path: string
}

export type BoilerplatePathCursor = {
  hostname_id: string
  url_id: string
  crawl_id?: string
  probe_id?: string
}

/**
 * Finds parent paths of the given hostnames with a recent HTML crawl and no
 * recent removal. The URL limit counts inspected rows, including ineligible ones. Path jobs prove the two-page
 * requirement before writing a result; a full page resumes after the last inspected URL.
 */
export const searchParentPathsNeedingBoilerplateRemoval = async (
  hostnameIds: string[],
  limit: number,
  options: { queryOptions?: QueryOptions; now?: () => Date; after?: BoilerplatePathCursor } = {},
): Promise<{ candidates: ParentPathCandidate[]; after?: BoilerplatePathCursor }> => {
  if (hostnameIds.length === 0) return { candidates: [] }
  const sampledNowMs = (options.now ?? (() => new Date()))().getTime()
  if (!Number.isFinite(sampledNowMs)) throw new RangeError('Invalid HTML snapshot decision time')
  const recentCutoffDate = new Date(
    sampledNowMs - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )
  const recentCutoffId = getMaxUuidv7ForDate(recentCutoffDate)
  const crawlIdFloor = getMinUuidv7ForDate(
    new Date(recentCutoffDate.getTime() - CRAWL_CLEANUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000),
  )
  const query = sql`/* searchParentPathsNeedingBoilerplateRemoval */
    SELECT u.id, u.hostname_id,
      CASE WHEN position('/' IN substring(u.pathname FROM 2)) > 0
        THEN left(u.pathname, position('/' IN substring(u.pathname FROM 2)))
        ELSE '/' END AS parent_path,
      (
        SELECT TRUE FROM url_hostnames h WHERE h.id = u.hostname_id
          AND NOT h.is_blocked AND h.is_crawlable LIMIT 1
      ) IS TRUE AND (
        SELECT TRUE FROM hostname_path_boilerplate_removals br
        WHERE br.hostname_id = u.hostname_id
          AND br.parent_path = CASE WHEN position('/' IN substring(u.pathname FROM 2)) > 0
            THEN left(u.pathname, position('/' IN substring(u.pathname FROM 2))) ELSE '/' END
          AND br.id > ${recentCutoffId}
        LIMIT 1
      ) IS NOT TRUE AS eligible
    FROM urls u
    WHERE u.hostname_id = ANY(${hostnameIds}::uuid[])
      AND (u.hostname_id, u.id) >= (
        COALESCE(${options.after?.hostname_id ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(${options.after?.url_id ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      )
      AND (${options.after?.crawl_id ?? null}::uuid IS NOT NULL
        OR ${options.after?.probe_id ?? null}::uuid IS NOT NULL
        OR u.id IS DISTINCT FROM ${options.after?.url_id ?? null}::uuid)
    ORDER BY u.hostname_id, u.id
    LIMIT ${limit}
  `
  const { rows } = await read<ParentPathCandidate & { id: string; eligible: boolean }>(
    query,
    undefined,
    options.queryOptions ?? {},
  )
  const inspection = await inspectBoilerplateCrawls(rows, limit, {
    cutoff: recentCutoffDate,
    floor: crawlIdFloor,
    crawlAfter: rows[0]?.id === options.after?.url_id ? options.after?.crawl_id : undefined,
    crawlProbe: rows[0]?.id === options.after?.url_id ? options.after?.probe_id : undefined,
    queryOptions: options.queryOptions,
  })
  const eligibleIds = new Set(inspection.eligibleCrawls.map(crawl => crawl.url_id))
  const candidatesByPath = new Map<string, ParentPathCandidate>()
  for (const row of rows) {
    if (eligibleIds.has(row.id))
      candidatesByPath.set(`${row.hostname_id}:${row.parent_path}`, {
        hostname_id: row.hostname_id,
        parent_path: row.parent_path,
      })
  }
  const candidates = [...candidatesByPath.values()]
  const last = rows.find(row => row.id === inspection.lastUrlId)
  return {
    candidates,
    after:
      last && (rows.length === limit || !inspection.allUrlsInspected)
        ? {
            hostname_id: last.hostname_id,
            url_id: last.id,
            ...(inspection.crawlAfter ? { crawl_id: inspection.crawlAfter } : {}),
            ...(inspection.crawlProbe ? { probe_id: inspection.crawlProbe } : {}),
          }
        : undefined,
  }
}
