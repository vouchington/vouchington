import { getEntityRelationElectionByTargetCachedBatch } from '../services/entity-fetch/get.mts'
import { write } from '@data-stores/psql'

export async function seedTopicMergeVotedRelations(
  sourceId: string,
  destinationId: string,
  postId: string,
  voterId: string,
  sourceOnlyVoterId: string,
) {
  const { rows } = await write<{ id: string; object_id: string }>(
    `/* seedTopicMergeVotedRelations */ INSERT INTO relation__post__category__topic (subject_id, object_id)
    VALUES ($3::uuid, $1::uuid), ($3::uuid, $2::uuid) RETURNING id, object_id`,
    [sourceId, destinationId, postId],
  )
  const source = rows.find(row => row.object_id === sourceId)!.id
  const destination = rows.find(row => row.object_id === destinationId)!.id
  await write(
    `/* seedTopicMergeVotedRelations */ INSERT INTO relation__post__category__topic__votes
    (subject_id, entity_relation_id, user_id, score)
    VALUES ($1::uuid, $2::uuid, $4::uuid, -1), ($1::uuid, $3::uuid, $4::uuid, 1), ($1::uuid, $2::uuid, $5::uuid, 1)`,
    [postId, source, destination, voterId, sourceOnlyVoterId],
  )
  return destination
}

export async function getTopicMergeVotedRelations(postId: string, topicIds: string[]) {
  const { rows } = await write<{
    id: string
    object_id: string
    votes_count_up: number
    votes_count_down: number
    user_id: string
    score: number
  }>(
    `/* getTopicMergeVotedRelations */ SELECT r.id, r.object_id, r.votes_count_up, r.votes_count_down, v.user_id, v.score
      FROM relation__post__category__topic r
      JOIN relation__post__category__topic__votes v ON v.subject_id = r.subject_id AND v.entity_relation_id = r.id
      WHERE r.subject_id = $1::uuid AND r.object_id = ANY($2::uuid[]) ORDER BY v.user_id`,
    [postId, topicIds],
  )
  return rows
}

export async function seedTopicMergeSubjectRelation(
  sourceId: string,
  postId: string,
  userId: string,
) {
  const { rows } = await write<{ id: string }>(
    `/* seedTopicMergeSubjectRelation */ INSERT INTO relation__topic__related__post
    (subject_id, object_id) VALUES ($1::uuid, $2::uuid) RETURNING id`,
    [sourceId, postId],
  )
  const relationId = rows[0]!.id
  await write(
    `/* seedTopicMergeSubjectRelation */ INSERT INTO relation__topic__related__post__votes
    (subject_id, entity_relation_id, user_id, score) VALUES ($1::uuid, $2::uuid, $3::uuid, 1)`,
    [sourceId, relationId, userId],
  )
  await write(
    `/* seedTopicMergeSubjectRelation */ INSERT INTO vote_integrity_flags
    (relation__topic__related__post_subject_id, relation__topic__related__post_id, flag_type)
    VALUES ($1::uuid, $2::uuid, 'velocity_spike')`,
    [sourceId, relationId],
  )
  return relationId
}

export async function getTopicMergeSubjectRelation(topicIds: string[], postId: string) {
  const { rows } = await write<{
    id: string
    subject_id: string
    user_id: string
    score: number
    votes_count_up: number
    flag_type: string
  }>(
    `/* getTopicMergeSubjectRelation */ SELECT r.id, r.subject_id, r.votes_count_up, v.user_id, v.score, f.flag_type
      FROM relation__topic__related__post r JOIN relation__topic__related__post__votes v
        ON v.subject_id = r.subject_id AND v.entity_relation_id = r.id
      JOIN vote_integrity_flags f ON f.relation__topic__related__post_subject_id = r.subject_id AND f.relation__topic__related__post_id = r.id
      WHERE r.subject_id = ANY($1::uuid[]) AND r.object_id = $2::uuid`,
    [topicIds, postId],
  )
  return rows
}

export async function getTopicMergeSubjectElection(relationId: string) {
  const [election] = await getEntityRelationElectionByTargetCachedBatch([
    { relationTable: 'relation__topic__related__post', entityRelationId: relationId },
  ])
  return election ?? null
}

export async function seedTopicMergeAuditCollision(
  sourceId: string,
  destinationId: string,
  postId: string,
  userId: string,
) {
  await Promise.all([
    seedTopicMergeSubjectRelation(sourceId, postId, userId),
    seedTopicMergeSubjectRelation(destinationId, postId, userId),
  ])
  const { rows } = await write<{ id: string; topic_id: string }>(
    `/* seedTopicMergeAuditCollision */
    SELECT id, relation__topic__related__post_subject_id AS topic_id FROM vote_integrity_flags
    WHERE relation__topic__related__post_subject_id = ANY($1::uuid[])`,
    [[sourceId, destinationId]],
  )
  return {
    sourceFlagId: rows.find(row => row.topic_id === sourceId)!.id,
    destinationFlagId: rows.find(row => row.topic_id === destinationId)!.id,
  }
}
