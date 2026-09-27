import { read } from '@data-stores/psql'
import { enqueueBulkReconcilePostNotifications } from '@queues/notifications/enqueues'
import sql from 'sql-template-strings'
import type { EntityRelationVoteTarget } from './delete-entity-relation-votes.mts'

export async function enqueueReconcileNotificationsForPostCategoryVotes(
  affectedEntityRelationTargets: EntityRelationVoteTarget[],
): Promise<void> {
  const direct = affectedEntityRelationTargets.filter(
    target => target.relationTable === 'relation__post__category__topic',
  )
  const alias = affectedEntityRelationTargets.filter(
    target => target.relationTable === 'relation__post__category__topic_alias',
  )
  if (direct.length === 0 && alias.length === 0) return

  const { rows } = await read<{ subject_id: string }>(sql`/* deleteUser:directPostTopicVotePosts */
    SELECT relation.subject_id
    FROM relation__post__category__topic relation
    JOIN UNNEST(${direct.map(target => target.subjectId)}::uuid[],
      ${direct.map(target => target.entityRelationId)}::uuid[]) AS target(subject_id, relation_id)
      ON target.subject_id = relation.subject_id AND target.relation_id = relation.id
    UNION
    SELECT relation.subject_id
    FROM relation__post__category__topic_alias relation
    JOIN UNNEST(${alias.map(target => target.subjectId)}::uuid[],
      ${alias.map(target => target.entityRelationId)}::uuid[]) AS target(subject_id, relation_id)
      ON target.subject_id = relation.subject_id AND target.relation_id = relation.id
  `)
  if (rows.length > 0) await enqueueBulkReconcilePostNotifications(rows.map(row => row.subject_id))
}

export async function getTopicIdsForPostCategoryVotes(
  affectedEntityRelationTargets: EntityRelationVoteTarget[],
): Promise<string[]> {
  const direct = affectedEntityRelationTargets.filter(
    target => target.relationTable === 'relation__post__category__topic',
  )
  const alias = affectedEntityRelationTargets.filter(
    target => target.relationTable === 'relation__post__category__topic_alias',
  )
  const { rows } = await read<{ topic_id: string }>(sql`/* getTopicIdsForPostCategoryVotes */
    SELECT relation.object_id AS topic_id FROM relation__post__category__topic relation
    JOIN UNNEST(${direct.map(target => target.subjectId)}::uuid[],
      ${direct.map(target => target.entityRelationId)}::uuid[]) AS target(subject_id, relation_id)
      ON target.subject_id = relation.subject_id AND target.relation_id = relation.id
    UNION
    SELECT topic_alias.topic_id FROM relation__post__category__topic_alias relation
    JOIN topic_aliases topic_alias ON topic_alias.id = relation.object_id
    JOIN UNNEST(${alias.map(target => target.subjectId)}::uuid[],
      ${alias.map(target => target.entityRelationId)}::uuid[]) AS target(subject_id, relation_id)
      ON target.subject_id = relation.subject_id AND target.relation_id = relation.id
  `)
  return rows.map(row => row.topic_id)
}
