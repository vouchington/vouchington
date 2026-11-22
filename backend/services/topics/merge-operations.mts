import { beginTransaction, write } from '@data-stores/psql'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { enqueueTopicMergePage } from '@queues/background/enqueues/topic-merge-enqueues'
import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { currentUserCanMergeTopic } from './authorization.mts'
import { assertTopicMergeParticipants } from './merge-preflight.mts'
import type { Topic } from './types.mts'

type TopicMergeOperationStatus = 'queued' | 'running' | 'completed' | 'failed'

export type PublicTopicMergeOperation = {
  id: string
  source_topic_id: string
  destination_topic_id: string
  status: TopicMergeOperationStatus
  stage: string
  created_at: Date
  completed_at: Date | null
  error_code: string | null
}

type OperationRow = PublicTopicMergeOperation & { generation: number }

const operationProjection = `id, source_topic_id, destination_topic_id,
  CASE WHEN completed_at IS NOT NULL THEN 'completed'
    WHEN failed_at IS NOT NULL THEN 'failed'
    WHEN started_at IS NOT NULL THEN 'running'
    ELSE 'queued' END AS status,
  stage::text AS stage, created_at, completed_at,
  CASE WHEN failed_at IS NOT NULL THEN error_code ELSE NULL END AS error_code, generation`

/** Reserves both live topics before queue admission, without running merge work in the request. */
export async function createTopicMergeOperation(
  currentUser: PrivateUser,
  sourceTopic: Topic,
  destinationTopic: Topic,
): Promise<PublicTopicMergeOperation> {
  assert(currentUserCanMergeTopic(currentUser), 403, 'Forbidden')
  assert(sourceTopic.id !== destinationTopic.id, 409, 'Cannot merge a topic into itself')
  const operation = await conflictOnSerializationFailure(async () => {
    await using query = await beginTransaction({ serializable: true })
    const { rows } = await query<OperationRow>(
      `/* createTopicMergeOperation */
      INSERT INTO topic_merge_operations (source_topic_id, destination_topic_id, requested_by_id)
      SELECT source.id, destination.id, $3::uuid
      FROM topics source
      JOIN topics destination ON destination.id = $2::uuid
        AND destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL
      WHERE source.id = $1::uuid
        AND source.deleted_at IS NULL AND source.merged_into_topic_id IS NULL
        AND source.topic_type = destination.topic_type
        AND NOT EXISTS (
          SELECT 1 FROM topic_aliases
          WHERE alias = source.slug AND unlink_requested_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM topic_merge_operations operation
          WHERE operation.completed_at IS NULL AND operation.failed_at IS NULL
            AND (operation.source_topic_id IN ($1::uuid, $2::uuid)
              OR operation.destination_topic_id IN ($1::uuid, $2::uuid))
        )
      RETURNING ${operationProjection}`,
      [sourceTopic.id, destinationTopic.id, currentUser.id],
    )
    if (!rows[0]) await assertTopicMergeParticipants(query, sourceTopic.id, destinationTopic.id)
    const admitted = rows[0]
    assert(admitted, 409, 'A topic merge is already in progress')
    await query.commit()
    return admitted
  }, 'Conflicting topic merge; try again')
  await awaitReportedEnqueueAdmission(() =>
    enqueueTopicMergePage(operation.id, operation.generation),
  )
  return toPublicOperation(operation)
}

export async function getTopicMergeOperation(
  currentUser: PrivateUser,
  sourceTopicId: string,
  operationId: string,
): Promise<PublicTopicMergeOperation | null> {
  assert(currentUserCanMergeTopic(currentUser), 403, 'Forbidden')
  const { rows } = await write<OperationRow>(
    `/* getTopicMergeOperation */ SELECT ${operationProjection}
      FROM topic_merge_operations WHERE id = $1::uuid AND source_topic_id = $2::uuid`,
    [operationId, sourceTopicId],
  )
  return rows[0] ? toPublicOperation(rows[0]) : null
}

function toPublicOperation(row: OperationRow): PublicTopicMergeOperation {
  const { generation: _generation, ...operation } = row
  return operation
}
