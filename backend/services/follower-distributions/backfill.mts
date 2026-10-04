import { getFollowerDistributionsWorkLimit } from './work-limits.mts'
import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function* streamIncompleteFollowerDistributionIdBatches(): AsyncGenerator<
  string[],
  void,
  unknown
> {
  const batchSize = getFollowerDistributionsWorkLimit('backfill_batch_size')
  yield* streamIncompleteFollowerDistributionIdBatchesFromRows(
    createAsyncGeneratorFromCursor<{ id: string }>(
      sql`/* streamIncompleteFollowerDistributionIdBatches */
        SELECT id
        FROM follower_distributions
        WHERE completed_at IS NULL
          AND failed_at IS NULL
        ORDER BY id
      `,
      { batchSize: batchSize },
    ),
    batchSize,
  )
}

export async function* streamIncompleteFollowerDistributionIdBatchesFromRows(
  rows: AsyncIterable<{ id: string }>,
  batchSize = getFollowerDistributionsWorkLimit('backfill_batch_size'),
): AsyncGenerator<string[], void, unknown> {
  let batch: string[] = []
  for await (const row of rows) {
    batch.push(row.id)
    if (batch.length >= batchSize) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) {
    yield batch
  }
}
