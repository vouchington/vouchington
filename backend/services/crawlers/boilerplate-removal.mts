import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '@voucha/config'
import sql from 'sql-template-strings'

type BoilerplateRemovalUrlCandidate = {
  id: string
  url: string
}

// Escape SQL LIKE metacharacters (% and _)
const escapeLikePattern = (pattern: string): string => pattern.replace(/[%_\\]/g, '\\$&')

export const searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId = async (
  hostnameId: string,
  parentPath: string,
  limit: number = 3,
  queryOptions: QueryOptions = {},
): Promise<BoilerplateRemovalUrlCandidate[]> => {
  const recentCutoffDate = new Date(
    Date.now() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )

  // Match URLs directly under the parent path (e.g., /blog/ for parent_path=/blog)
  const parentPathPrefix = parentPath === '/' ? '/' : `${parentPath}/`
  const escapedPrefix = escapeLikePattern(parentPathPrefix)

  // Exclude URLs with more nested levels (e.g., /blog/2024/post would not match /blog/post)
  const parentPathExclude = parentPath === '/' ? '/%/%' : `${parentPath}/%/%`
  const escapedExclude = escapeLikePattern(parentPathExclude)

  const likePattern = `${escapedPrefix}%`

  const { rows } = await read(
    sql`/* searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId */
    SELECT ordered_candidates.id, ordered_candidates.url
    FROM (
      SELECT latest_recent_body_crawls.id, latest_recent_body_crawls.url
      FROM (
        SELECT DISTINCT ON (u.id)
          u.id,
          u.url,
          c.completed_at,
          c.id AS crawl_id
        FROM urls u
        JOIN url_hostnames h
          ON h.id = u.hostname_id
        JOIN crawls c
          ON c.url_id = u.id
        WHERE u.hostname_id = ${hostnameId}
          AND u.pathname LIKE ${likePattern} ESCAPE '\\'
          AND u.pathname NOT LIKE ${escapedExclude} ESCAPE '\\'
          AND (h.blocked IS NULL OR h.blocked = false)
          AND (h.crawlable IS NULL OR h.crawlable = true)
          AND c.response_status_code = 200
          AND c.completed_at >= ${recentCutoffDate}
          AND c.html_sha256 IS NOT NULL
          AND COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >= ${recentCutoffDate}
        ORDER BY u.id, c.completed_at DESC, c.id DESC
      ) latest_recent_body_crawls
      ORDER BY latest_recent_body_crawls.completed_at DESC, latest_recent_body_crawls.crawl_id DESC
      LIMIT ${limit}
    ) ordered_candidates
    `,
    undefined,
    queryOptions,
  )

  return rows
}
