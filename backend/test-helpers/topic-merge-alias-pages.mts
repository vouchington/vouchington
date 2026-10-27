import { beginTransaction, write } from '@data-stores/psql'
import { lockTopicMergeAdmission } from '../services/topics/merge-preflight.mts'
import {
  processTopicMergeAliasPage,
  type TopicMergeAliasPhase,
} from '../services/topics/merge-aliases-page.mts'

export async function createTopicMergeAliasTestOperation(
  sourceId: string,
  destinationId: string,
  userId: string,
) {
  await using query = await beginTransaction()
  await lockTopicMergeAdmission(query)
  const { rows } = await query<{ id: string }>(
    `/* createTopicMergeAliasTestOperation */ INSERT INTO topic_merge_operations
      (source_topic_id, destination_topic_id, requested_by_id, stage)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'aliases') RETURNING id`,
    [sourceId, destinationId, userId],
  )
  await query.commit()
  return rows[0]!.id
}

/** Execute an actual page transaction, not a wait for a background condition. */
export async function runTopicMergeAliasTestPage(operationId: string, limit: number) {
  await using query = await beginTransaction()
  const { rows } = await query<{
    source_topic_id: string
    destination_topic_id: string
    requested_by_id: string
    source_slug: string
    alias_phase: TopicMergeAliasPhase
    cursor_alias: string | null
  }>(
    `/* runTopicMergeAliasTestPage */ SELECT operation.*, topic.slug AS source_slug,
      set_config('voucha.topic_merge_operation_id', operation.id::text, TRUE),
      set_config('voucha.topic_merge_fence_token', operation.fence_token::text, TRUE)
      FROM topic_merge_operations operation JOIN topics topic ON topic.id = operation.source_topic_id
      WHERE operation.id = $1::uuid FOR UPDATE OF operation`,
    [operationId],
  )
  const operation = rows[0]!
  const result = await processTopicMergeAliasPage(
    query,
    operationId,
    operation.source_topic_id,
    operation.destination_topic_id,
    operation.requested_by_id,
    operation.source_slug,
    operation.alias_phase,
    operation.cursor_alias,
    limit,
  )
  const done = result.phase === 4 && !result.hasMore
  const nextPhase = result.hasMore || done ? result.phase : result.phase + 1
  await query(
    `/* runTopicMergeAliasTestPage checkpoint */ UPDATE topic_merge_operations
      SET alias_phase = $2::smallint, cursor_alias = $3, generation = generation + 1 WHERE id = $1::uuid`,
    [operationId, nextPhase, result.hasMore ? result.cursorAlias : null],
  )
  await query.commit()
  return { done, phase: result.phase }
}

export async function deleteTopicMergeAliasTestOperation(operationId: string) {
  await write(
    `/* deleteTopicMergeAliasTestOperation */ DELETE FROM topic_merge_operations WHERE id = $1::uuid`,
    [operationId],
  )
}
