import { read } from '@data-stores/psql'
import { getKagiCandidateBatchSize } from './import-config.mts'

/** Check only this fetched candidate set, in bounded indexed URL probes. */
export async function getExistingRssFeedUrls(candidates: readonly string[]): Promise<Set<string>> {
  const urls = new Set<string>()
  const batchSize = getKagiCandidateBatchSize()
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    // oxlint-disable-next-line no-await-in-loop -- one bounded database candidate probe at a time.
    const { rows } = await read<{ url: string }>(
      `/* getExistingRssFeedUrls */
      SELECT urls.url FROM urls
      WHERE urls.url = ANY($1::text[])
        AND EXISTS (SELECT 1 FROM rss_feeds WHERE rss_feed_url_id = urls.id AND deleted_at IS NULL)
      LIMIT $2
    `,
      [candidates.slice(offset, offset + batchSize), batchSize],
    )
    for (const row of rows) urls.add(row.url)
  }
  return urls
}
