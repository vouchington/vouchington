import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Insert a parent-child relation between two topics
 */
export async function insertTestTopicParentRelation(data: {
  childTopicId: string
  parentTopicId: string
  createdById: string
}): Promise<void> {
  await write(
    sql`/* insertTestTopicParentRelation */ INSERT INTO relation__topic__parent__topic (subject_id, object_id, created_by_id)
      VALUES (${data.childTopicId}, ${data.parentTopicId}, ${data.createdById})
      ON CONFLICT DO NOTHING`,
  )
}
