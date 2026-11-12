import { write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getBatchListingPageSize } from '@services/embeddings/batch/config'

/** A remote submit is impossible before submitted_at is durably set. */
export async function cleanupAbandonedPreparingBatches(ttlHours: number): Promise<void> {
  const cutoff = getMinUUIDv7ForDate(new Date(Date.now() - ttlHours * 60 * 60_000))
  await write(
    `/* cleanupAbandonedPreparingBatches */
    WITH expired AS (
      SELECT id FROM gemini_embedding_batches
      WHERE submitted_at IS NULL AND completed_at IS NULL
        AND failed_at IS NULL AND cancelled_at IS NULL AND id < $1::uuid
      ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED
    )
    DELETE FROM gemini_embedding_batches batch USING expired
    WHERE batch.id = expired.id`,
    [cutoff, getBatchListingPageSize()],
  )
}
