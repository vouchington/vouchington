import { read } from '@data-stores/psql'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'
import sql from 'sql-template-strings'
import { downloadCrawlHtmlToTempFile, type CrawlHtmlTempFile } from './s3.mts'
import onError from '@modules/on-error'

export const getHtmlBySelectedCrawls = async (
  samples: { url_id: string; crawl_id: string }[],
): Promise<(CrawlHtmlTempFile & { urlId: string; crawlId: string })[]> => {
  if (samples.length === 0) return []

  const recentCutoffDate = new Date(
    Date.now() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )

  const { rows } = await readSelectedHtmlRows(samples, recentCutoffDate)

  const results: (CrawlHtmlTempFile & { urlId: string; crawlId: string })[] = []
  for (const row of rows) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- downloading sequentially is the memory bound: concurrent page bodies previously multiplied heap use.
      const html = await downloadCrawlHtmlToTempFile(row.hostname, row.url_id, row.html_sha256_hex)
      if (html) results.push({ ...html, urlId: row.url_id, crawlId: row.crawl_id })
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
  return results
}

async function readSelectedHtmlRows(
  samples: { url_id: string; crawl_id: string }[],
  recentCutoffDate: Date,
) {
  return read<{ html_sha256_hex: string; hostname: string; url_id: string; crawl_id: string }>(
    sql`/* getHtmlBySelectedCrawls */
    SELECT c.id AS crawl_id, encode(c.html_sha256, 'hex') AS html_sha256_hex, c.url_id, h.hostname
    FROM unnest(${samples.map(sample => sample.url_id)}::uuid[],
      ${samples.map(sample => sample.crawl_id)}::uuid[]) AS selected(url_id, crawl_id)
    JOIN crawls c ON c.id = selected.crawl_id AND c.url_id = selected.url_id
    JOIN urls u ON u.id = c.url_id
    JOIN url_hostnames h ON h.id = u.hostname_id
    WHERE c.response_status_code = 200 AND c.html_sha256 IS NOT NULL
      AND c.completed_at >= ${recentCutoffDate}
      AND COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >= ${recentCutoffDate}
    ORDER BY c.url_id
    LIMIT ${samples.length}
    `,
  )
}
