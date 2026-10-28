import { beginTransaction, write } from '@data-stores/psql'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { enqueueTopicMergePage } from '@queues/background/enqueues/topic-merge-enqueues'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { currentUserCanMergeTopic } from './authorization.mts'
import {
  lockAndAssertMergeParticipants,
  lockTopicMergeAdmission,
  lockTopicMergeLifecycles,
} from './merge-preflight.mts'
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
  await using query = await beginTransaction()
  await lockTopicMergeAdmission(query)
  const topicIds = [sourceTopic.id, destinationTopic.id]
  await lockTopicMergeLifecycles(query, topicIds)
  await lockAndAssertMergeParticipants(query, sourceTopic.id, destinationTopic.id)
  const { rows: reservations } = await query<{ id: string }>(
    `/* createTopicMergeOperation reservations */
      SELECT id FROM topic_merge_operations
      WHERE completed_at IS NULL AND failed_at IS NULL
        AND (source_topic_id = ANY($1::uuid[]) OR destination_topic_id = ANY($1::uuid[]))
      LIMIT 1`,
    [topicIds],
  )
  assert(reservations.length === 0, 409, 'A topic merge is already in progress')
  const { rows } = await query<OperationRow>(
    `/* createTopicMergeOperation */ INSERT INTO topic_merge_operations
      (source_topic_id, destination_topic_id, requested_by_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid)
      RETURNING ${operationProjection}`,
    [sourceTopic.id, destinationTopic.id, currentUser.id],
  )
  const operation = rows[0]!
  await query.commit()
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
