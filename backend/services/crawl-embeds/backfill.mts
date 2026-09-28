import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import onError from '@modules/on-error'
import { enqueueBulkCrawlEmbeds } from '@queues/crawl-embeds/enqueues'
import sql from 'sql-template-strings'
import { getOEmbedEndpointHostname } from './endpoint-hostname.mts'

const BACKFILL_BATCH_SIZE = 500

export async function backfillPendingCrawlEmbeds(): Promise<void> {
  for await (const entries of streamPendingCrawlEmbedBatches()) {
    await enqueueBulkCrawlEmbeds(entries)
  }
}

async function* streamPendingCrawlEmbedBatches(): AsyncGenerator<
  Array<{ crawlId: string; endpointHostname: string }>,
  void,
  unknown
> {
  let entries: Array<{ crawlId: string; endpointHostname: string }> = []
  for await (const row of createAsyncGeneratorFromCursor<{ id: string; oembed_url: string }>(
    sql`/* streamPendingCrawlEmbedBatches */
      SELECT id, embed_oembed_url AS oembed_url
      FROM crawls
      WHERE embed_metadata IS NOT NULL
        AND embed_oembed_url IS NOT NULL
        AND embed_oembed_resolved_at IS NULL
      ORDER BY id
    `,
    { batchSize: BACKFILL_BATCH_SIZE },
  )) {
    const endpointHostname = getOEmbedEndpointHostname(row.oembed_url)
    if (!endpointHostname) {
      onError(new Error(`crawl ${row.id} has an invalid oEmbed endpoint`))
      continue
    }
    entries.push({ crawlId: row.id, endpointHostname })
    if (entries.length >= BACKFILL_BATCH_SIZE) {
      yield entries
      entries = []
    }
  }
  if (entries.length > 0) yield entries
}
