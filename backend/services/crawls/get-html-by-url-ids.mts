import { read } from '@data-stores/psql'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'
import sql from 'sql-template-strings'
import { downloadCrawlHtmlToTempFile, type CrawlHtmlTempFile } from './s3.mts'
import onError from '@modules/on-error'

export const getLatestHtmlByUrlIds = async (urlIds: string[]): Promise<CrawlHtmlTempFile[]> => {
  if (urlIds.length === 0) return []

  const recentCutoffDate = new Date(
    Date.now() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )

  const { rows } = await readLatestHtmlRows(urlIds, recentCutoffDate)

  const results: CrawlHtmlTempFile[] = []
  for (const row of rows) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- downloading sequentially is the memory bound: concurrent page bodies previously multiplied heap use.
      const html = await downloadCrawlHtmlToTempFile(row.hostname, row.url_id, row.html_sha256_hex)
      if (html) results.push(html)
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
  return results
}

async function readLatestHtmlRows(urlIds: string[], recentCutoffDate: Date) {
  return read<{ html_sha256_hex: string; hostname: string; url_id: string }>(
    sql`/* getLatestHtmlByUrlIds */
    SELECT DISTINCT ON (u.id)
      c.id AS crawl_id,
      encode(c.html_sha256, 'hex') AS html_sha256_hex,
      c.html_snapshot_uploaded_at,
      c.url_id,
      h.hostname
    FROM unnest(${urlIds}::UUID[]) AS u(id)
    -- no-mistakes-disable-next-line postgres-required-predicates: URL IDs and completed_at do not give a safe UUIDv7 crawl-ID partition bound; a crawl may finish long after it starts
    JOIN crawls c ON c.url_id = u.id
    JOIN urls uu ON uu.id = u.id
    JOIN url_hostnames h ON h.id = uu.hostname_id
    WHERE c.response_status_code = 200
      AND c.completed_at >= ${recentCutoffDate}
      AND c.html_sha256 IS NOT NULL
      AND COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >= ${recentCutoffDate}
    ORDER BY u.id, c.completed_at DESC, c.id DESC
    `,
  )
}
