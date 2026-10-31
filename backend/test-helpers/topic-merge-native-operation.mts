import { beginTransaction, write } from '@data-stores/psql'
import { lockTopicMergeAdmission } from '../services/topics/merge-preflight.mts'

export type TopicMergeNativeCheckpoint = {
  generation: number
  stage: string
  stage_table_position: number
  alias_phase: number
  cursor_alias: string | null
  completed_at: Date | null
  failed_at: Date | null
  updated_at: Date
}

/** Creates only the owned durable operation; the test admits its first native job separately. */
export async function createTopicMergeNativeOperation(
  sourceId: string,
  destinationId: string,
  requestedById: string,
): Promise<string> {
  await using query = await beginTransaction()
  await lockTopicMergeAdmission(query)
  const { rows } = await query<{ id: string }>(
    `/* createTopicMergeNativeOperation */ INSERT INTO topic_merge_operations
      (source_topic_id, destination_topic_id, requested_by_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid) RETURNING id`,
    [sourceId, destinationId, requestedById],
  )
  await query.commit()
  return rows[0]!.id
}

export async function getTopicMergeNativeCheckpoint(
  operationId: string,
): Promise<TopicMergeNativeCheckpoint> {
  const { rows } = await write<TopicMergeNativeCheckpoint>(
    `/* getTopicMergeNativeCheckpoint */ SELECT generation, stage::text AS stage,
      stage_table_position,
      alias_phase, cursor_alias,
      completed_at, failed_at, updated_at FROM topic_merge_operations WHERE id = $1::uuid`,
    [operationId],
  )
  const checkpoint = rows[0]
  if (!checkpoint) throw new Error(`Topic merge operation ${operationId} is missing`)
  return checkpoint
}

export async function deleteTopicMergeNativeOperation(operationId: string): Promise<void> {
  await write(
    `/* deleteTopicMergeNativeOperation */ DELETE FROM topic_merge_operations WHERE id = $1::uuid`,
    [operationId],
  )
}
