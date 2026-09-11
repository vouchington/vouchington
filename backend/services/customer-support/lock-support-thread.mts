import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockSupportThread(threadId: string, options: QueryOptions): Promise<boolean> {
  const { rows } = await write(
    sql`/* lockSupportThread */
      SELECT id
      FROM support_threads
      WHERE id = ${threadId}
      FOR UPDATE
    `,
    options,
  )
  return rows.length === 1
}
