import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AsidePreference } from './types.mts'

export async function listAsidePreferences(userId: string): Promise<AsidePreference[]> {
  const { rows } = await read(sql`/* listAsidePreferences */
    SELECT id, aside_key, dismissed_at
    FROM user_aside_preferences
    WHERE user_id = ${userId}
    ORDER BY dismissed_at DESC
  `)

  return rows as AsidePreference[]
}
