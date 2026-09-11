import { read } from '@data-stores/psql'
import { enqueueBulkReconcilePostNotifications } from '@queues/notifications/enqueues'
import sql from 'sql-template-strings'

export async function enqueueReconcileNotificationsForPostCategoryVotes(
  affectedEntityRelationTargets: Array<{ relationTable: string; entityRelationId: string }>,
): Promise<void> {
  const directRelationIds: string[] = []
  const aliasRelationIds: string[] = []
  for (const target of affectedEntityRelationTargets) {
    if (target.relationTable === 'relation__post__category__topic') {
      directRelationIds.push(target.entityRelationId)
    } else if (target.relationTable === 'relation__post__category__topic_alias') {
      aliasRelationIds.push(target.entityRelationId)
    }
  }
  if (directRelationIds.length === 0 && aliasRelationIds.length === 0) return

  const { rows } = await read<{ subject_id: string }>(sql`/* deleteUser:directPostTopicVotePosts */
    SELECT subject_id
    FROM relation__post__category__topic
    WHERE id = ANY(${directRelationIds}::uuid[])
    UNION
    SELECT subject_id
    FROM relation__post__category__topic_alias
    WHERE id = ANY(${aliasRelationIds}::uuid[])
  `)
  if (rows.length > 0) await enqueueBulkReconcilePostNotifications(rows.map(row => row.subject_id))
}

export async function getTopicIdsForPostCategoryVotes(
  affectedEntityRelationTargets: Array<{ relationTable: string; entityRelationId: string }>,
): Promise<string[]> {
  const directRelationIds: string[] = []
  const aliasRelationIds: string[] = []
  for (const target of affectedEntityRelationTargets) {
    if (target.relationTable === 'relation__post__category__topic')
      directRelationIds.push(target.entityRelationId)
    if (target.relationTable === 'relation__post__category__topic_alias')
      aliasRelationIds.push(target.entityRelationId)
  }
  const { rows } = await read<{ topic_id: string }>(sql`/* getTopicIdsForPostCategoryVotes */
    SELECT object_id AS topic_id FROM relation__post__category__topic WHERE id = ANY(${directRelationIds}::uuid[])
    UNION
    SELECT alias.topic_id FROM relation__post__category__topic_alias relation JOIN topic_aliases alias ON alias.id = relation.object_id WHERE relation.id = ANY(${aliasRelationIds}::uuid[])
  `)
  return rows.map(row => row.topic_id)
}
