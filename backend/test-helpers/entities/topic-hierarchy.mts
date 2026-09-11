import { write } from '@data-stores/psql'
import { getEntityRelationTableNameOrThrow } from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'

const TOPIC_PARENT_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'topic',
  predicate: 'parent',
  objectType: 'topic',
})

/**
 * Insert a parent-child relation between two topics
 */
export async function insertTestTopicParentRelation(data: {
  childTopicId: string
  parentTopicId: string
  createdById: string
}): Promise<void> {
  await write(
    sql`INSERT INTO `.append(TOPIC_PARENT_RELATION_TABLE).append(
      sql` (subject_id, object_id, created_by_id)
      VALUES (${data.childTopicId}, ${data.parentTopicId}, ${data.createdById})
      ON CONFLICT DO NOTHING`,
    ),
  )
}
