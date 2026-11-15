import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMinUUIDv7ForParentHistory } from '@modules/utils/ids'

export async function updateAttributionSignup(
  sessionId: string,
  referrerId: string,
  userId: string,
): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* updateAttributionSignup */
      UPDATE session_referral_attributions
      SET signed_up_at = CURRENT_TIMESTAMP,
          user_id = ${userId}
      WHERE id = (
        SELECT id FROM session_referral_attributions
        WHERE session_id = ${sessionId}
          AND referrer_user_id = ${referrerId}
          AND id >= ${getMinUUIDv7ForParentHistory(referrerId)}::uuid
          AND signed_up_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      )
        AND signed_up_at IS NULL
        AND EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND deleted_at IS NULL)
    `)
  await query.commit()
}
