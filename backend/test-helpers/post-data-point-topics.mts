import { write } from '@data-stores/psql'

/** Topic ids stored for one data-point post, in stored order. */
export async function getPostDataPointTopicIdsForTest(postId: string): Promise<string[]> {
  const { rows } = await write<{ topic_id: string }>(
    `/* getPostDataPointTopicIdsForTest */
    SELECT topic_id FROM post_data_point_topics WHERE post_id = $1::uuid ORDER BY order_index`,
    [postId],
  )
  return rows.map(row => row.topic_id)
}
