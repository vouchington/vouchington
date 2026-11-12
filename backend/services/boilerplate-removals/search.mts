import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getMaxUUIDv7ForDate, getMinUUIDv7ForDate } from '@modules/utils'
import {
  CRAWL_HTML_SNAPSHOT_RETENTION_DAYS,
  CRAWL_CLEANUP_MAX_AGE_DAYS,
} from '@services/crawls/constants'
import sql from 'sql-template-strings'

export type ParentPathCandidate = {
  hostname_id: string
  parent_path: string
}

/**
 * Finds parent paths of the given hostnames that have at least two recent HTML crawls and no
 * recent removal. The caller bounds `hostnameIds`; there is no all-hostnames path.
 */
export const searchParentPathsNeedingBoilerplateRemoval = async (
  hostnameIds: string[],
  limit: number,
  options: { queryOptions?: QueryOptions; now?: () => Date } = {},
): Promise<ParentPathCandidate[]> => {
  if (hostnameIds.length === 0) return []
  const sampledNowMs = (options.now ?? (() => new Date()))().getTime()
  if (!Number.isFinite(sampledNowMs)) throw new RangeError('Invalid HTML snapshot decision time')
  const recentCutoffDate = new Date(
    sampledNowMs - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )
  const recentCutoffId = getMaxUUIDv7ForDate(recentCutoffDate)
  const crawlIdFloor = getMinUUIDv7ForDate(
    new Date(recentCutoffDate.getTime() - CRAWL_CLEANUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000),
  )
  const query = sql`/* searchParentPathsNeedingBoilerplateRemoval */
    WITH eligible_hostnames AS MATERIALIZED (
      SELECT h.id
      FROM url_hostnames h
      WHERE h.id = ANY(${hostnameIds}::uuid[])
        AND NOT h.is_blocked
        AND h.is_crawlable
    )
    SELECT h.id AS hostname_id, paths.parent_path
    FROM eligible_hostnames h
    CROSS JOIN LATERAL (
      SELECT u.parent_path
      FROM (
        SELECT url.id,
          CASE
            WHEN position('/' IN substring(url.pathname FROM 2)) > 0
            THEN left(url.pathname, position('/' IN substring(url.pathname FROM 2)))
            ELSE '/'
          END AS parent_path
        FROM urls url WHERE url.hostname_id = h.id
      ) u
      JOIN LATERAL (
        SELECT 1 FROM crawls c
        WHERE c.url_id = u.id
          AND c.id >= ${crawlIdFloor}::uuid
          AND c.response_status_code = 200
          AND c.completed_at >= ${recentCutoffDate}
          AND c.html_sha256 IS NOT NULL
          AND COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >= ${recentCutoffDate}
        LIMIT 1
      ) recent_crawl ON TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM hostname_path_boilerplate_removals br
        WHERE br.hostname_id = h.id
          AND br.parent_path = u.parent_path
          AND br.id > ${recentCutoffId}
      )
      GROUP BY u.parent_path
      HAVING COUNT(*) >= 2
    ) paths
    ORDER BY h.id, paths.parent_path
    LIMIT ${limit}
  `

  const { rows } = await read<ParentPathCandidate>(query, undefined, options.queryOptions ?? {})

  return rows
}
