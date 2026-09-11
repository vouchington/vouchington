import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Number of IDs accumulated before a batch is yielded for bulk enqueue. The cursor
// reads from PostgreSQL in pages of this size and we re-chunk yields to match, so
// each yielded batch becomes a single glide-mq addBulk call.
const BACKFILL_BATCH_SIZE = 500

// Streams IDs from a source-of-truth query over a single pg-cursor connection,
// yielding them in fixed-size batches. Memory stays O(BACKFILL_BATCH_SIZE)
// regardless of table size, and consumers can bulk-enqueue one batch per yield.
async function* streamIdBatches(
  rows: AsyncIterable<{ id: string }>,
): AsyncGenerator<string[], void, unknown> {
  let batch: string[] = []
  for await (const row of rows) {
    batch.push(row.id)
    if (batch.length >= BACKFILL_BATCH_SIZE) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) {
    yield batch
  }
}

/**
 * Streams batches of post IDs that are missing OpenAI omni moderation results.
 *
 * Used by the backfill dispatcher to re-enqueue moderation for posts that were never
 * processed or whose jobs were lost (e.g. after a Valkey wipe).
 *
 * A post needs (re-)moderation whenever the fingerprint that was actually moderated
 * (`input_sha256`) differs from the current content fingerprint (`content_sha256`):
 * `input_sha256 IS DISTINCT FROM content_sha256`. Because `content_sha256` is NOT NULL,
 * this is equivalent to (and uses) the existing
 * `ids_posts__openai_omni_moderation_to_update` partial index predicate
 * (`input_sha256 IS NULL OR input_sha256 != content_sha256`). It correctly covers:
 *
 * - Never moderated (input NULL, content set) → included.
 * - Content changed after a prior moderation (input != content) → included.
 * - No-content-marked then edited to add content (`markPostOpenAIModerationNoContent`
 *   left input NULL while the edit updated content_sha256) → included. A `created_at`-based
 *   predicate would miss this case.
 * - Up to date (input == content) → excluded.
 *
 * No-content-complete posts (input NULL, content = empty fingerprint) are also matched,
 * but re-enqueuing them is idempotent and makes no OpenAI call (the worker re-marks them
 * no-content), and a backfill is a rare recovery operation — so over-inclusion is harmless.
 */
export function streamUnmoderatedPostIdBatches(): AsyncGenerator<string[], void, unknown> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamUnmoderatedPostIdBatches */
        SELECT id FROM posts
        WHERE openai_omni_moderation_input_sha256 IS DISTINCT FROM openai_omni_moderation_content_sha256
          AND deleted_at IS NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

/**
 * Streams batches of image IDs that are missing OpenAI omni moderation results.
 *
 * Only includes images with completed uploads — pending or failed uploads do not have
 * a usable S3 object for the moderation API to inspect.
 */
export function streamUnmoderatedImageIdBatches(): AsyncGenerator<string[], void, unknown> {
  return streamIdBatches(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamUnmoderatedImageIdBatches */
        SELECT id FROM images
        WHERE openai_omni_moderation_created_at IS NULL
          AND deleted_at IS NULL
          AND upload_completed_at IS NOT NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}
