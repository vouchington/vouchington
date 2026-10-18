import { read, type QueryExecutor } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'
import sql from 'sql-template-strings'
import { downloadCrawlHtmlToTempFile, type CrawlHtmlTempFile } from './s3.mts'
import onError from '@modules/on-error'

export type GetLatestHtmlByUrlIdsDependencies = {
  read?: typeof read
  downloadCrawlHtmlToTempFile?: typeof downloadCrawlHtmlToTempFile
  onError?: typeof onError
  now?: () => Date
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
  const query: QueryExecutor = (input, values) => readRows(input, values, queryOptions)
  const downloadCrawlHtml = dependencies.downloadCrawlHtmlToTempFile ?? downloadCrawlHtmlToTempFile
  const reportError = dependencies.onError ?? onError
  const sampledNowMs = (dependencies.now ?? (() => new Date()))().getTime()
  if (!Number.isFinite(sampledNowMs)) throw new RangeError('Invalid HTML snapshot decision time')
  const recentCutoffDate = new Date(
    sampledNowMs - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )

  const { rows } = await readLatestHtmlRows(query, urlIds, recentCutoffDate)

  const results: CrawlHtmlTempFile[] = []
  for (const row of rows) {
    try {
      const htmlSha256Hex = requireHtmlSha256Hex(row.html_sha256_hex)
      // oxlint-disable-next-line no-await-in-loop -- downloading sequentially is the memory bound: concurrent page bodies previously multiplied heap use.
      const html = await downloadCrawlHtml(row.hostname, row.url_id, htmlSha256Hex)
      if (html) results.push(html)
    } catch (err) {
      reportError(err instanceof Error ? err : new Error(String(err)))
    }
  }
  return results
}

async function readLatestHtmlRows(query: QueryExecutor, urlIds: string[], recentCutoffDate: Date) {
  return query<{ html_sha256_hex: string | null; hostname: string; url_id: string }>(
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
