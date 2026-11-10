import { beginTransaction, write } from '@data-stores/psql'

/** Commits the merge redirect and clears the source metric row the refresher must not recreate. */
export async function commitTopicMergeClearingRatingMetrics(
  sourceId: string,
  destinationId: string,
  mergerId: string,
): Promise<void> {
  await using merge = await beginTransaction()
  await merge(
    `/* commitTopicMergeClearingRatingMetrics redirect */ UPDATE topics SET
      merged_into_topic_id = $2::uuid, merged_at = CURRENT_TIMESTAMP, merged_by_id = $3::uuid
      WHERE id = $1::uuid`,
    [sourceId, destinationId, mergerId],
  )
  await merge(
    `/* commitTopicMergeClearingRatingMetrics metrics */ DELETE FROM topic_metrics
      WHERE topic_id = $1::uuid`,
    [sourceId],
  )
  await merge.commit()
}

export async function hasTopicMergeRatingMetricRow(topicId: string): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(
    `/* hasTopicMergeRatingMetricRow */ SELECT EXISTS(
      SELECT 1 FROM topic_metrics WHERE topic_id = $1::uuid
    ) AS exists`,
    [topicId],
  )
  return rows[0]!.exists
}
