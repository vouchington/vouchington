import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function restoreTopic(topicId: string): Promise<void> {
  await write(sql`
    UPDATE topics
    SET deleted_at = NULL, deleted_by_id = NULL
    WHERE id = ${topicId}
  `)
}
