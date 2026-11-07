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
    SELECT
      latest.crawl_id,
      encode(latest.html_sha256, 'hex') AS html_sha256_hex,
      latest.html_snapshot_uploaded_at,
      latest.url_id,
      h.hostname
    FROM unnest(${[...new Set(urlIds)]}::UUID[]) AS u(id)
    JOIN urls uu ON uu.id = u.id
    JOIN url_hostnames h ON h.id = uu.hostname_id
    CROSS JOIN LATERAL (
      SELECT
        c.id AS crawl_id,
        c.html_sha256,
        c.html_snapshot_uploaded_at,
        c.url_id
      -- no-mistakes-disable-next-line postgres-required-predicates: no-mistakes FP jonathanong/no-mistakes#3112; remove when fixed. One LIMIT 1 probe per input URL id on idx_crawls__url_id__completed_at_desc (url_id, completed_at DESC, id DESC); the only caller passes at most 3 candidate ids (workers/crawl-dispatch/processors/boilerplate.mts via the limit-3 candidate search)
      FROM crawls c
      WHERE c.url_id = u.id
        AND c.response_status_code = 200
        AND c.completed_at >= ${recentCutoffDate}
        AND c.html_sha256 IS NOT NULL
        AND COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >= ${recentCutoffDate}
      ORDER BY c.completed_at DESC, c.id DESC
      LIMIT 1
    ) latest
    ORDER BY u.id
    `,
  )
}
