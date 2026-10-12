import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function restoreTopic(topicId: string): Promise<void> {
  await write(sql`
    UPDATE topics
    SET deleted_at = NULL, deleted_by_id = NULL
    WHERE id = ${topicId}
  `)
}
