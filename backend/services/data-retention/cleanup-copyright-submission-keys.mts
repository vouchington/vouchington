import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { DataRetentionLimits } from './config.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'

/** Clear the raw UUID after 30 days; the case-owned digest keeps live-case replay exact. */
export async function cleanupCopyrightSubmissionKeys(
  limits: DataRetentionLimits,
  now = new Date(),
  requestIds?: readonly string[],
): Promise<{ cleared: number; hasMore: boolean }> {
  if (requestIds && requestIds.length > limits.batchSize)
    throw new RangeError('Scoped copyright submission key cleanup must fit one page')
  const cutoff = getMinUUIDv7ForDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000))
  const result = await runBoundedBatches(
    { ...limits, maxBatches: requestIds ? 1 : limits.maxBatches },
    batchSize => clearCopyrightSubmissionKeyPage(cutoff, batchSize, requestIds),
  )
  return { cleared: result.deleted, hasMore: result.hasMore }
}

async function clearCopyrightSubmissionKeyPage(
  cutoff: string,
  batchSize: number,
  requestIds?: readonly string[],
): Promise<number> {
  await using transaction = await beginTransaction()
  await transaction(
    "/* enableCopyrightSubmissionKeyRetention */ SET LOCAL app.copyright_submission_key_retention = 'on'",
  )
  const result = await transaction(
    `/* clearCopyrightSubmissionKeyPage */
    WITH candidates AS (
      SELECT id FROM copyright_notice_submission_requests
      WHERE id < $1::uuid AND idempotency_key IS NOT NULL
        AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))
      ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED
    )
    UPDATE copyright_notice_submission_requests request
    SET idempotency_key = NULL
    FROM candidates WHERE request.id = candidates.id`,
    [cutoff, batchSize, requestIds ?? null],
  )
  await transaction.commit()
  return result.rowCount ?? 0
}
