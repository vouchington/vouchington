import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function softDeleteTopic(topicId: string, deletedById: string): Promise<void> {
  await write(sql`
    UPDATE topics
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = ${deletedById}
    WHERE id = ${topicId}
  `)
}

export async function hardDeleteTestTopic(topicId: string): Promise<void> {
  await write(sql`/* hardDeleteTestTopic */ DELETE FROM topics WHERE id = ${topicId}`)
}

/**
 * Directly sets the three merge columns on a topic row for testing purposes.
 * Use when you need a topic in the "merged" lifecycle state without running the
 * full `mergeTopicAliases` business logic.
 *
 * All three merge columns must be set together per `chk_topics_merge_state_complete`.
 */
export async function mergeTopicForTest(
  topicId: string,
  intoTopicId: string,
  mergedById: string,
): Promise<void> {
  await write(sql`
    UPDATE topics
    SET merged_into_topic_id = ${intoTopicId},
        merged_at = CURRENT_TIMESTAMP,
        merged_by_id = ${mergedById}
    WHERE id = ${topicId}
  `)
}

export async function getTopicDeletedById(topicId: string): Promise<{
  deleted_by_id: string | null
} | null> {
  const { rows } = await read(sql`
    SELECT deleted_by_id
    FROM topics
    WHERE id = ${topicId}
  `)
  return rows[0] ?? null
}
