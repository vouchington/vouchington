import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function restoreAside(userId: string, asideKey: string): Promise<void> {
  await write(sql`/* restoreAside */
    DELETE FROM user_aside_preferences
    WHERE user_id = ${userId}
      AND aside_key = ${asideKey}
  `)
}
