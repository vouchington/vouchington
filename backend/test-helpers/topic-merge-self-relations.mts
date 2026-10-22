import { beginTransaction, write } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

export async function seedTopicMergeVotedRelatedTopics(
  childId: string,
  parentId: string,
  voterId: string,
) {
  const { rows } = await write<{ id: string }>(
    `/* seedTopicMergeVotedRelatedTopics */
    INSERT INTO relation__topic__related__topic (subject_id, object_id)
    VALUES ($1::uuid, $2::uuid) RETURNING id`,
    [childId, parentId],
  )
  const relationId = rows[0]!.id
  const { rows: voteRows } = await write<{ id: string }>(
    `/* seedTopicMergeVotedRelatedTopics vote */
    INSERT INTO relation__topic__related__topic__votes (subject_id, entity_relation_id, user_id, score)
    VALUES ($1::uuid, $2::uuid, $3::uuid, 1) RETURNING id`,
    [childId, relationId, voterId],
  )
  return { relationId, voteId: voteRows[0]!.id }
}

export async function seedTopicMergeFlaggedVotedRelatedTopics(
  childId: string,
  parentId: string,
  voterId: string,
) {
  const { relationId, voteId } = await seedTopicMergeVotedRelatedTopics(childId, parentId, voterId)
  const { rows: flagRows } = await write<{ id: string }>(
    `/* seedTopicMergeFlaggedVotedRelatedTopics flag */
    INSERT INTO vote_integrity_flags
      (relation__topic__related__topic_subject_id, relation__topic__related__topic_id, flag_type)
    VALUES ($1::uuid, $2::uuid, 'velocity_spike') RETURNING id`,
    [childId, relationId],
  )
  return { relationId, voteId, flagId: flagRows[0]!.id }
}

export async function withHeldTopicMergeTopicRow<T>(
  topicId: string,
  whileLocked: (holderProcessId: number) => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  await query(
    `/* withHeldTopicMergeTopicRow */ SELECT id FROM topics WHERE id = $1::uuid FOR UPDATE`,
    [topicId],
  )
  const holderProcessId = await getTestPostgresBackendProcessId(query)
  return await whileLocked(holderProcessId)
}

export async function getTopicMergeFlaggedVotedRelatedTopics(childId: string, relationId: string) {
  const { rows } = await write<{
    relation_id: string
    subject_id: string
    object_id: string
    vote_id: string | null
    flag_id: string | null
    resolved_at: Date | null
  }>(
    `/* getTopicMergeFlaggedVotedRelatedTopics */
    SELECT r.id AS relation_id, r.subject_id, r.object_id,
      v.id AS vote_id, f.id AS flag_id, f.resolved_at
    FROM relation__topic__related__topic r
    LEFT JOIN relation__topic__related__topic__votes v
      ON v.subject_id = r.subject_id AND v.entity_relation_id = r.id
    LEFT JOIN vote_integrity_flags f
      ON f.relation__topic__related__topic_subject_id = r.subject_id
        AND f.relation__topic__related__topic_id = r.id
    WHERE r.subject_id = $1::uuid AND r.id = $2::uuid`,
    [childId, relationId],
  )
  return rows
}
