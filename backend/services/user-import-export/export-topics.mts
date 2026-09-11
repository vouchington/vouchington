import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ExportTopic = {
  name: string
  slug: string
  topic_type: string
}

export function streamUserTopics(
  currentUserId: string,
  maxItems: number,
): AsyncGenerator<ExportTopic> {
  const query = sql`/* exportUserTopics */
      SELECT
        t.name,
        t.slug,
        t.topic_type
      FROM relation__user__follow__topic r
      JOIN topics t ON t.id = r.object_id
      WHERE r.subject_id = ${currentUserId}
        AND r.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
      ORDER BY t.name ASC, t.id ASC
      LIMIT ${maxItems}
    `
  return createAsyncGeneratorFromCursor<ExportTopic>(query, { batchSize: 1000 })
}

export async function* streamUserTopicsAsJsonArray(
  currentUserId: string,
  maxItems: number,
): AsyncGenerator<string> {
  let separator = ''
  yield '['
  for await (const topic of streamUserTopics(currentUserId, maxItems)) {
    yield `${separator}${JSON.stringify(topic)}`
    separator = ','
  }
  yield ']'
}

export async function userTopicExportExceedsLimit(
  currentUserId: string,
  maxItems: number,
): Promise<boolean> {
  const { rows } = await read<{ count: number }>(sql`/* userTopicExportExceedsLimit */
    SELECT COUNT(*)::int AS count
    FROM relation__user__follow__topic r
    JOIN topics t ON t.id = r.object_id
    WHERE r.subject_id = ${currentUserId}
      AND r.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
  `)
  return rows[0]!.count > maxItems
}
