import {
  beginTransaction,
  write,
  type OwnedTransaction,
  type QueryExecutor,
} from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function runClassifierBorrowedTestTransaction<Result>(
  operation: (transaction: OwnedTransaction) => Promise<Result>,
  options: { commit?: boolean } = {},
): Promise<Result> {
  await using transaction = await beginTransaction()
  const result = await operation(transaction)
  if (options.commit) await transaction.commit()
  return result
}

export async function getClassifierBorrowedDecisionFacts(
  batchId: string,
  query: QueryExecutor = write,
): Promise<{
  batches: number
  calls: number
  snapshots: number
  topicResults: number
  storyResults: number
}> {
  const { rows } = await query<{
    batches: number
    calls: number
    snapshots: number
    topic_results: number
    story_results: number
  }>(sql`/* getClassifierBorrowedDecisionFacts */
    SELECT
      (SELECT COUNT(*)::int FROM classifier_decision_batches WHERE id = ${batchId}) AS batches,
      (SELECT COUNT(*)::int FROM classifier_decision_calls WHERE batch_id = ${batchId}) AS calls,
      (SELECT COUNT(*)::int FROM classifier_decision_batch_candidates WHERE batch_id = ${batchId}) AS snapshots,
      (SELECT COUNT(*)::int FROM topic_classifier_results WHERE batch_id = ${batchId}) AS topic_results,
      (SELECT COUNT(*)::int FROM story_classifier_results WHERE batch_id = ${batchId}) AS story_results
  `)
  const row = rows[0]!
  return {
    batches: row.batches,
    calls: row.calls,
    snapshots: row.snapshots,
    topicResults: row.topic_results,
    storyResults: row.story_results,
  }
}
