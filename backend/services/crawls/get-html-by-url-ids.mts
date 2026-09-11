import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'
import sql from 'sql-template-strings'
import { downloadCrawlHtmlToTempFile, type CrawlHtmlTempFile } from './s3.mts'
import onError from '@modules/on-error'

export type GetLatestHtmlByUrlIdsDependencies = {
  read?: typeof read
  downloadCrawlHtmlToTempFile?: typeof downloadCrawlHtmlToTempFile
  onError?: typeof onError
}

function requireHtmlSha256Hex(htmlSha256Hex: unknown): string {
  if (typeof htmlSha256Hex === 'string' && htmlSha256Hex.length > 0) return htmlSha256Hex
  throw new Error('Expected latest crawl HTML row to include html_sha256_hex')
}

export const getLatestHtmlByUrlIds = async (
  urlIds: string[],
  queryOptions: QueryOptions = {},
  dependencies: GetLatestHtmlByUrlIdsDependencies = {},
): Promise<CrawlHtmlTempFile[]> => {
  if (urlIds.length === 0) return []

  const readRows = dependencies.read ?? read
  const downloadCrawlHtml = dependencies.downloadCrawlHtmlToTempFile ?? downloadCrawlHtmlToTempFile
  const reportError = dependencies.onError ?? onError
  const recentCutoffDate = new Date(
    Date.now() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )

  const { rows } = await readRows(
    sql`/* getLatestHtmlByUrlIds */
    SELECT DISTINCT ON (u.id)
      c.id AS crawl_id,
      encode(c.html_sha256, 'hex') AS html_sha256_hex,
      c.html_snapshot_uploaded_at,
      c.url_id,
      h.hostname
    FROM unnest(${urlIds}::UUID[]) AS u(id)
    JOIN crawls c ON c.url_id = u.id
    JOIN urls uu ON uu.id = u.id
    JOIN url_hostnames h ON h.id = uu.hostname_id
    WHERE c.response_status_code = 200
      AND c.completed_at >= ${recentCutoffDate}
      AND c.html_sha256 IS NOT NULL
      AND COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >= ${recentCutoffDate}
    ORDER BY u.id, c.completed_at DESC, c.id DESC
    `,
    undefined,
    queryOptions,
  )

  const results: CrawlHtmlTempFile[] = []
  for (const row of rows) {
    try {
      const htmlSha256Hex = requireHtmlSha256Hex(row.html_sha256_hex)
      // oxlint-disable-next-line no-await-in-loop -- downloading sequentially is the memory bound: concurrent page bodies previously multiplied heap use.
      const html = await downloadCrawlHtml(row.hostname, row.url_id, htmlSha256Hex)
      if (html) results.push(html)
    } catch (error) {
      reportError(error instanceof Error ? error : new Error(String(error)))
    }
  }
  return results
}
