import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '@services/crawls/constants'
import sql from 'sql-template-strings'

export type ParentPathCandidate = {
  hostname_id: string
  parent_path: string
}

export const searchParentPathsNeedingBoilerplateRemoval = async (
  limit: number,
  options: { hostnameId?: string; queryOptions?: QueryOptions } = {},
): Promise<ParentPathCandidate[]> => {
  const recentCutoffDate = new Date(
    Date.now() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )
  const recentCutoffId = getMaxUUIDv7ForDate(recentCutoffDate)
  const query = sql`/* searchParentPathsNeedingBoilerplateRemoval */
    WITH recent_html_urls AS (
      SELECT
        DISTINCT ON (u.id)
        u.id,
        u.hostname_id,
        CASE
          WHEN position('/' IN substring(u.pathname FROM 2)) > 0
          THEN left(u.pathname, position('/' IN substring(u.pathname FROM 2)))
          ELSE '/'
        END AS parent_path
      FROM urls u
      JOIN url_hostnames h ON h.id = u.hostname_id
      JOIN crawls c ON c.url_id = u.id
      WHERE (h.blocked IS NULL OR h.blocked = false)
        AND (h.crawlable IS NULL OR h.crawlable = true)
        AND c.response_status_code = 200
        AND c.completed_at >= ${recentCutoffDate}
        AND c.html_sha256 IS NOT NULL
        AND COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >= ${recentCutoffDate}
  `
  if (options.hostnameId) {
    query.append(sql` AND u.hostname_id = ${options.hostnameId}::uuid`)
  }
  query.append(sql`
        ORDER BY u.id, c.completed_at DESC, c.id DESC
    )
    SELECT hostname_id, parent_path
    FROM recent_html_urls
    WHERE NOT EXISTS (
      SELECT 1
      FROM boilerplate_removals br
      WHERE br.hostname_id = recent_html_urls.hostname_id
        AND br.parent_path = recent_html_urls.parent_path
        AND br.id > ${recentCutoffId}
    )
    GROUP BY hostname_id, parent_path
    HAVING COUNT(*) >= 2
    ORDER BY hostname_id
    LIMIT ${limit}
  `)

  const { rows } = await read(query, undefined, options.queryOptions ?? {})

  return rows
}
