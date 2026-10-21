import type { TransactionQuery } from '@data-stores/psql'

export const derivedReferences = [
  ['topic_metrics', 'topic_id'],
  ['bedrock_embedding_batch_entities', 'topic_id'],
  ['classifier_run_candidates', 'topic_id'],
  ['topic_classifier_results', 'topic_id'],
  ['post_autotagger_result_topics', 'topic_id'],
  ['rss_feed_item_autotagger_result_topics', 'topic_id'],
  ['autotagger_agent_run_topics', 'topic_id'],
  ['post_classifier_local_outcomes', 'local_topic_id'],
] as const

export async function deleteMergedTopicDerivedRows(
  query: TransactionQuery,
  sourceId: string,
): Promise<void> {
  await query(
    `/* deleteMergedTopicDerivedRows */ WITH ${derivedReferences
      .map(
        ([table, column], index) =>
          `d${index} AS (DELETE FROM ${table} WHERE ${column} = $1::uuid RETURNING 1)`,
      )
      .join(',\n')} SELECT 1`,
    [sourceId],
  )
}
