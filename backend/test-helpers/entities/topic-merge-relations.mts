import type { TransactionQuery } from '@data-stores/psql'
import { lockTopicMergeAdmission } from '../../services/topics/merge-preflight.mts'

type VoteInput = { parent: 'source' | 'destination'; userId: string; score: number | null }
export type TopicMergeRelationFixture = {
  operationId: string
  sourceRelationId: string
  destinationRelationId: string
  voteIds: string[]
}

/** All relation fixtures and their operation reservation are owned by the caller's rollback transaction. */
export async function seedBoundedTopicMergeRelations(
  query: TransactionQuery,
  input: {
    sourceId: string
    destinationId: string
    objectId: string
    requesterId: string
    deletedDestination?: boolean
    votes?: VoteInput[]
    conflictingFlags?: boolean
  },
): Promise<TopicMergeRelationFixture> {
  await lockTopicMergeAdmission(query)
  const { rows } = await query<{ id: string; subject_id: string }>(
    `/* seedBoundedTopicMergeRelations parents */
    INSERT INTO relation__topic__related__topic (subject_id, object_id, created_by_id, deleted_at)
    VALUES ($1::uuid, $3::uuid, $4::uuid, NULL),
      ($2::uuid, $3::uuid, $4::uuid, CASE WHEN $5::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)
    RETURNING id, subject_id`,
    [
      input.sourceId,
      input.destinationId,
      input.objectId,
      input.requesterId,
      input.deletedDestination ?? false,
    ],
  )
  const sourceRelationId = rows.find(row => row.subject_id === input.sourceId)!.id
  const destinationRelationId = rows.find(row => row.subject_id === input.destinationId)!.id
  const voteIds: string[] = []
  for (const vote of input.votes ?? []) {
    const { rows: events } = await query<{ id: string }>(
      `/* seedBoundedTopicMergeRelations vote */
      INSERT INTO relation__topic__related__topic__votes (subject_id, entity_relation_id, user_id, score)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::smallint) RETURNING id`,
      [
        vote.parent === 'source' ? input.sourceId : input.destinationId,
        vote.parent === 'source' ? sourceRelationId : destinationRelationId,
        vote.userId,
        vote.score,
      ],
    )
    voteIds.push(events[0]!.id)
  }
  if (input.conflictingFlags)
    await query(
      `/* seedBoundedTopicMergeRelations flags */
      INSERT INTO vote_integrity_flags (relation__topic__related__topic_subject_id,
        relation__topic__related__topic_id, flag_type)
      VALUES ($1::uuid, $2::uuid, 'velocity_spike'), ($3::uuid, $4::uuid, 'velocity_spike')`,
      [input.sourceId, sourceRelationId, input.destinationId, destinationRelationId],
    )
  const { rows: operations } = await query<{ id: string; fence_token: string }>(
    `/* seedBoundedTopicMergeRelations operation */
    INSERT INTO topic_merge_operations (source_topic_id, destination_topic_id, requested_by_id)
    VALUES ($1::uuid, $2::uuid, $3::uuid) RETURNING id, fence_token`,
    [input.sourceId, input.destinationId, input.requesterId],
  )
  const operation = operations[0]!
  await query(
    `/* seedBoundedTopicMergeRelations fence */
    SELECT set_config('voucha.topic_merge_operation_id', $1, TRUE),
      set_config('voucha.topic_merge_fence_token', $2, TRUE)`,
    [operation.id, operation.fence_token],
  )
  return { operationId: operation.id, sourceRelationId, destinationRelationId, voteIds }
}

export async function readBoundedTopicMergeRelationState(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
  objectId: string,
  operationId: string,
) {
  const { rows: parents } = await query<{
    id: string
    subject_id: string
    deleted_at: Date | null
    votes_count_up: number
    votes_count_down: number
  }>(
    `/* readBoundedTopicMergeRelationState parents */
    SELECT id, subject_id, deleted_at, votes_count_up, votes_count_down
    FROM relation__topic__related__topic WHERE subject_id = ANY(ARRAY[$1::uuid, $2::uuid])
      AND object_id = $3::uuid ORDER BY subject_id`,
    [sourceId, destinationId, objectId],
  )
  const { rows: votes } = await query<{
    id: string
    entity_relation_id: string
    user_id: string
    score: number | null
  }>(
    `/* readBoundedTopicMergeRelationState votes */
    SELECT votes.id, votes.entity_relation_id, votes.user_id, votes.score
    FROM relation__topic__related__topic__votes votes
    JOIN relation__topic__related__topic parent ON parent.subject_id = votes.subject_id AND parent.id = votes.entity_relation_id
    WHERE parent.subject_id = ANY(ARRAY[$1::uuid, $2::uuid]) AND parent.object_id = $3::uuid ORDER BY votes.id`,
    [sourceId, destinationId, objectId],
  )
  const { rows: mappings } = await query(
    `/* readBoundedTopicMergeRelationState mappings */
    SELECT priority FROM topic_merge_topic_related_topic_parent_mappings WHERE operation_id = $1::uuid`,
    [operationId],
  )
  const { rows: owners } = await query(
    `/* readBoundedTopicMergeRelationState owners */
    SELECT user_id FROM topic_merge_topic_related_topic_vote_owners WHERE operation_id = $1::uuid`,
    [operationId],
  )
  return { parents, votes, mappings, owners }
}
