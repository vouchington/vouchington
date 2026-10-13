import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getMentionRowsForRelationTable(
  tableName: string,
  postId: string,
): Promise<
  Array<{
    subject_id: string
    deleted_at: Date | null
  }>
> {
  const allowedTables = new Set([
    'relation__user__mentioned__post',
    'relation__topic__mentioned__post',
    'relation__post__mentioned__post',
  ])
  if (!allowedTables.has(tableName)) {
    throw new Error(`Invalid mention relation table name: ${tableName}`)
  }
  const { rows } = await read(
    sql`/* getMentionRowsForRelationTable */
    SELECT subject_id, deleted_at
    FROM `.append(tableName).append(sql`
    WHERE object_id = ${postId}
    ORDER BY subject_id ASC
  `),
  )
  return rows as Array<{ subject_id: string; deleted_at: Date | null }>
}
