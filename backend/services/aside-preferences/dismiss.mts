import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function dismissAside(userId: string, asideKey: string): Promise<void> {
  await write(sql`/* dismissAside */
    INSERT INTO user_aside_preferences (user_id, aside_key, dismissed_at)
    VALUES (${userId}, ${asideKey}, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, aside_key) DO UPDATE
      SET dismissed_at = EXCLUDED.dismissed_at
  `)
}
