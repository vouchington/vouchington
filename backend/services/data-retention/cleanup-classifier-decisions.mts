import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteOldClassifierCalls(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rowCount } = await query(sql`/* deleteOldClassifierCalls */
    DELETE FROM classifier_decision_calls call
    USING classifier_decision_batches batch
    WHERE call.id = ANY(${[...ids]}::uuid[])
      AND batch.id = call.batch_id AND batch.completed_at IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM topic_classifier_results result
          WHERE result.decision_call_id = call.id AND result.batch_id = call.batch_id
        )
      AND NOT EXISTS (
          SELECT 1 FROM story_classifier_results result
          WHERE result.decision_call_id = call.id AND result.batch_id = call.batch_id
        )
      AND NOT EXISTS (
          SELECT 1 FROM community_prompt_classifier_results result
          WHERE result.decision_call_id = call.id AND result.batch_id = call.batch_id
        )
  `)
  return rowCount ?? 0
}

export async function deleteOldClassifierBatches(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rowCount } = await query(sql`/* deleteOldClassifierBatches */
    DELETE FROM classifier_decision_batches batch
    WHERE batch.id = ANY(${[...ids]}::uuid[])
      AND batch.completed_at IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM classifier_runs run WHERE run.decision_batch_id = batch.id
        )
      AND NOT EXISTS (
          SELECT 1 FROM classifier_decision_calls call WHERE call.batch_id = batch.id
        )
      AND NOT EXISTS (
          SELECT 1 FROM classifier_decision_batch_candidates candidate
          WHERE candidate.batch_id = batch.id
        )
      AND NOT EXISTS (
          SELECT 1 FROM topic_classifier_results result WHERE result.batch_id = batch.id
        )
      AND NOT EXISTS (
          SELECT 1 FROM story_classifier_results result WHERE result.batch_id = batch.id
        )
      AND NOT EXISTS (
          SELECT 1 FROM community_prompt_classifier_results result
          WHERE result.batch_id = batch.id
        )
  `)
  return rowCount ?? 0
}
