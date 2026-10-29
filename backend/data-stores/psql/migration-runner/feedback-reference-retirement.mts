import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { parseMonthlyPartitionName } from '@vouchington/postgres/partitions'
import type { QueryExecutor } from '../types.mts'
import type { PartitionDropCandidate } from './partition-drop-guard.mts'

/** Nullable feedback links must be cleared before DETACH; FK SET NULL only runs on row deletes. */
export async function clearBoundedFeedbackReferences(
  transaction: QueryExecutor,
  candidate: PartitionDropCandidate,
  batchSize: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0)
    throw new RangeError('Feedback reference batch size must be a positive safe integer')
  const parsed = parseMonthlyPartitionName(candidate.partition)!
  const lower = getMinUUIDv7ForDate(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)))
  const upper = getMinUUIDv7ForDate(candidate.upperBound!)
  await transaction(
    `/* cleanupPartitions:clearFeedbackReferences */
    WITH selected AS (
      SELECT id FROM moderation_training_feedbacks
      WHERE post_clearance_change_id >= $1::uuid
        AND post_clearance_change_id < $2::uuid
      ORDER BY post_clearance_change_id, id
      LIMIT $3
      FOR UPDATE
    )
    UPDATE moderation_training_feedbacks feedback
    SET post_clearance_change_id = NULL
    FROM selected
    WHERE feedback.id = selected.id`,
    [lower, upper, batchSize],
  )
  const { rows } = await transaction(
    `/* cleanupPartitions:remainingFeedbackReferences */
    SELECT 1 FROM moderation_training_feedbacks
    WHERE post_clearance_change_id >= $1::uuid
      AND post_clearance_change_id < $2::uuid
    LIMIT 1`,
    [lower, upper],
  )
  return rows.length > 0
}
