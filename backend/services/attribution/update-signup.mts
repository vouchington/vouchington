import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function updateAttributionSignup(
  sessionId: string,
  referrerId: string,
  userId: string,
): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* updateAttributionSignup */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  await query(sql`/* updateAttributionSignup */
      UPDATE session_referral_attributions
      SET signed_up_at = CURRENT_TIMESTAMP,
          user_id = ${userId}
      WHERE session_id = ${sessionId}
        AND referrer_id = ${referrerId}
        AND signed_up_at IS NULL
    `)
  await query.commit()
}
