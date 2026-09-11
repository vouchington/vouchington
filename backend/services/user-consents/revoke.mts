import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ConsentType } from './types.mts'

export async function revokeConsent(userId: string, consentType: ConsentType): Promise<void> {
  await write(sql`/* revokeConsent */
    UPDATE user_consents
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND consent_type = ${consentType}
      AND revoked_at IS NULL
  `)
}
