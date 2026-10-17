import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Whether the crawl embed backfill would still select this crawl (same predicate). */
export async function isCrawlEmbedBackfillCandidate(crawlId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isCrawlEmbedBackfillCandidate */
    SELECT id FROM crawls
    WHERE id = ${crawlId}
      AND embed_metadata IS NOT NULL
      AND embed_oembed_url IS NOT NULL
      AND embed_oembed_resolved_at IS NULL
  `)
  return rows.length > 0
}
