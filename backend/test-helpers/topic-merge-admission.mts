import { write } from '@data-stores/psql'

export type TopicMergeAdmissionCheckpoint = {
  stage: string
  stage_table_position: number
  cursor_row_id: string | null
  cursor_subject_id: string | null
  cursor_object_id: string | null
  generation: number
  completed_at: Date | null
}

/** Read the durable page cursor from the writer after a queue admission attempt. */
export async function getTopicMergeAdmissionCheckpoint(
  operationId: string,
): Promise<TopicMergeAdmissionCheckpoint> {
  const { rows } = await write<TopicMergeAdmissionCheckpoint>(
    `/* getTopicMergeAdmissionCheckpoint */ SELECT stage::text, stage_table_position,
      cursor_row_id, cursor_subject_id, cursor_object_id, generation, completed_at
      FROM topic_merge_operations WHERE id = $1::uuid`,
    [operationId],
  )
  return rows[0]!
}

export async function readActiveTopicMergeAdmissionIds(sourceTopicIds: readonly string[]) {
  const { rows } = await write<{ id: string }>(
    `/* readActiveTopicMergeAdmissionIds */ SELECT id FROM topic_merge_operations
      WHERE source_topic_id = ANY($1::uuid[])
        AND completed_at IS NULL AND failed_at IS NULL`,
    [sourceTopicIds],
  )
  return rows.map(row => row.id)
}
