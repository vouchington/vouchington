import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestRetainedUserLegalClocks(userId: string): Promise<{
  last_legal_preservation_hold_released_at: Date | null
  purged_at: Date | null
} | null> {
  const { rows } = await read<{
    last_legal_preservation_hold_released_at: Date | null
    purged_at: Date | null
  }>(sql`
    /* readTestRetainedUserLegalClocks */
    SELECT last_legal_preservation_hold_released_at, purged_at
    FROM retained_user_identities WHERE id = ${userId}`)
  return rows[0] ?? null
}
