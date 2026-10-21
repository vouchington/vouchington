import { write } from '@data-stores/psql'

export async function getTopicMergeFeedOwner(feedId: string): Promise<string | null> {
  const { rows } = await write<{ topic_id: string | null }>(
    `/* getTopicMergeFeedOwner */ SELECT topic_id FROM rss_feeds WHERE id = $1::uuid`,
    [feedId],
  )
  return rows[0]?.topic_id ?? null
}

export async function seedTopicMergeRelations(
  sourceId: string,
  destinationId: string,
  userId: string,
): Promise<void> {
  await write(
    `/* seedTopicMergeRelations */ INSERT INTO relation__user__follow__topic (subject_id, object_id)
    VALUES ($3::uuid, $1::uuid), ($3::uuid, $2::uuid)`,
    [sourceId, destinationId, userId],
  )
  await write(
    `/* seedTopicMergeRelations */ INSERT INTO relation__topic__parent__topic (subject_id, object_id)
    VALUES ($1::uuid, $2::uuid), ($2::uuid, $1::uuid)`,
    [sourceId, destinationId],
  )
}

export async function getTopicMergeRelations(
  sourceId: string,
  destinationId: string,
  userId: string,
) {
  const [follows, parents] = await Promise.all([
    write<{ object_id: string }>(
      `/* getTopicMergeRelations follows */ SELECT object_id FROM relation__user__follow__topic WHERE subject_id = $1::uuid AND object_id = ANY($2::uuid[])`,
      [userId, [sourceId, destinationId]],
    ),
    write<{ subject_id: string; object_id: string }>(
      `/* getTopicMergeRelations parents */ SELECT subject_id, object_id FROM relation__topic__parent__topic WHERE subject_id = ANY($1::uuid[]) AND object_id = ANY($1::uuid[])`,
      [[sourceId, destinationId]],
    ),
  ])
  return { follows: follows.rows, parents: parents.rows }
}

export async function seedTopicMergeHistory(sourceId: string, userId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* seedTopicMergeHistory */ INSERT INTO topic_revisions
    (topic_id, revised_by_id, revision_type) VALUES ($1::uuid, $2::uuid, 'update') RETURNING id`,
    [sourceId, userId],
  )
  return rows[0]!.id
}

export async function getTopicMergeHistoryAndMetrics(
  sourceId: string,
  destinationId: string,
  revisionId: string,
) {
  const { rows } = await write<{
    history_topic_id: string | null
    source_metrics_count: number
    destination_follow_count: number
  }>(
    `/* getTopicMergeHistoryAndMetrics */ SELECT
      (SELECT topic_id FROM topic_revisions WHERE topic_id = $1::uuid AND id = $3::uuid) AS history_topic_id,
      (SELECT count(*)::int FROM topic_metrics WHERE topic_id = $1::uuid) AS source_metrics_count,
      (SELECT bookmarks__follow_count FROM topic_metrics WHERE topic_id = $2::uuid) AS destination_follow_count`,
    [sourceId, destinationId, revisionId],
  )
  return rows[0]!
}

export async function softDeleteTopicMergeFeed(feedId: string): Promise<void> {
  await write(
    `/* softDeleteTopicMergeFeed */ UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
    [feedId],
  )
}
