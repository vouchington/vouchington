import { write } from '@data-stores/psql'

export type TopicMergeMetricProjection = {
  votes_score_up: number
  votes_score_none: number
  votes_score_down: number
  votes_count_up: number
  votes_count_none: number
  votes_count_down: number
  votes_snapshot_xmax: string | null
  votes_snapshot_xip_count: number | null
  ratings__score__1: number
  ratings__score__2: number
  ratings__score__3: number
  ratings__score__4: number
  ratings__score__5: number
  ratings__count__1: number
  ratings__count__2: number
  ratings__count__3: number
  ratings__count__4: number
  ratings__count__5: number
  bookmarks__follow_count: number
}

export async function getTopicMergeVoteHistory(
  userId: string,
  topicIds: readonly string[],
): Promise<Array<{ topic_id: string; score: number | null }>> {
  const { rows } = await write<{ topic_id: string; score: number | null }>(
    `/* getTopicMergeVoteHistory */ SELECT topic_id, score FROM topic_votes
      WHERE user_id = $1::uuid AND topic_id = ANY($2::uuid[]) ORDER BY id`,
    [userId, topicIds],
  )
  return rows
}

export async function seedTopicMergeMetricFollows(
  rows: readonly { userId: string; topicId: string; deleted: boolean }[],
): Promise<void> {
  await write(
    `/* seedTopicMergeMetricFollows */ INSERT INTO relation__user__follow__topic
      (subject_id, object_id, deleted_at)
      SELECT subject_id, object_id,
        CASE WHEN deleted THEN CURRENT_TIMESTAMP ELSE NULL::timestamptz END
      FROM unnest($1::uuid[], $2::uuid[], $3::boolean[])
        AS input(subject_id, object_id, deleted)`,
    [rows.map(row => row.userId), rows.map(row => row.topicId), rows.map(row => row.deleted)],
  )
}

export async function getTopicMergeMetricProjection(
  topicId: string,
): Promise<TopicMergeMetricProjection> {
  const { rows } = await write<TopicMergeMetricProjection>(
    `/* getTopicMergeMetricProjection */ SELECT
      topic.votes_score_up, topic.votes_score_none, topic.votes_score_down,
      topic.votes_count_up, topic.votes_count_none, topic.votes_count_down,
      topic.votes_snapshot_xmax::text, topic.votes_snapshot_xip_count,
      metrics.ratings__score__1, metrics.ratings__score__2, metrics.ratings__score__3,
      metrics.ratings__score__4, metrics.ratings__score__5,
      metrics.ratings__count__1, metrics.ratings__count__2, metrics.ratings__count__3,
      metrics.ratings__count__4, metrics.ratings__count__5,
      metrics.bookmarks__follow_count
      FROM topics topic JOIN topic_metrics metrics ON metrics.topic_id = topic.id
      WHERE topic.id = $1::uuid`,
    [topicId],
  )
  const projection = rows[0]
  if (!projection) throw new Error(`Topic metric projection missing for ${topicId}`)
  return projection
}
