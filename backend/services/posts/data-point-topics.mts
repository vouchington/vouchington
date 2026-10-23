import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTopicReferenceAttachmentFences } from '@services/post-publication/lock'

/**
 * Insert rows into post_data_point_topics for a data_point post.
 * Must be called inside a transaction (pass `{ query }` as options).
 * For updates, call `DELETE FROM post_data_point_topics WHERE post_id = $id`
 * before calling this function to replace the existing rows.
 */
export async function insertPostDataPointTopics(
  postId: string,
  topicIds: string[],
  options: QueryOptions,
): Promise<void> {
  await withTopicReferenceAttachmentFences(topicIds, options, query =>
    write(
      sql`/* insertPostDataPointTopics */
      INSERT INTO post_data_point_topics (post_id, topic_id, order_index)
      SELECT ${postId}, topic_id, order_index
      FROM UNNEST(
        ${topicIds}::uuid[],
        ${topicIds.map((_, i) => i)}::int[]
      ) AS t(topic_id, order_index)`,
      { query },
    ),
  )
}
