import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

const BACKFILL_BATCH_SIZE = 500

export async function* streamIncompleteFollowerDistributionIdBatches(): AsyncGenerator<
  string[],
  void,
  unknown
> {
  yield* streamIncompleteFollowerDistributionIdBatchesFromRows(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamIncompleteFollowerDistributionIdBatches */
        SELECT id
        FROM follower_distributions
        WHERE completed_at IS NULL
          AND failed_at IS NULL
        ORDER BY id
      `,
      { batchSize: BACKFILL_BATCH_SIZE },
    ),
  )
}

export async function* streamIncompleteFollowerDistributionIdBatchesFromRows(
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
