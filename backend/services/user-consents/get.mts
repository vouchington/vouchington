import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { UserConsent } from './types.mts'

export async function getActiveConsents(userId: string): Promise<UserConsent[]> {
  const { rows } = await read(sql`/* getActiveConsents */
    SELECT id, user_id, consent_type, version, created_at, revoked_at
    FROM user_consents
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
  `)
  return rows as UserConsent[]
}
