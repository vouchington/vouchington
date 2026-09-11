import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isUUID } from '@modules/utils'
import onError from '@modules/on-error'

export async function getSignupCountByReferrerId(referrerId: string): Promise<number> {
  if (!isUUID(referrerId)) return 0
  const { rows } = await read(sql`/* getSignupCountByReferrerId */
    SELECT COUNT(*)::INT AS total_signups
    FROM users
    WHERE referrer_id = ${referrerId}
      AND deleted_at IS NULL
  `)
  return (rows[0] as { total_signups: number } | undefined)?.total_signups ?? 0
}

export async function getReferrerIdForSession(sessionId: string): Promise<string | null> {
  if (!isUUID(sessionId)) {
    const error = new Error(`getReferrerIdForSession called with non-UUID sessionId: ${sessionId}`)
    ;(error as Error & { tags?: Record<string, boolean> }).tags = { suppressLogging: true }
    onError(error)
    return null
  }
  const { rows } = await read(sql`/* getReferrerIdForSession */
    SELECT referrer_id
    FROM session_referral_attributions
    WHERE session_id = ${sessionId}
    ORDER BY id ASC
    LIMIT 1
  `)
  return rows[0]?.referrer_id ?? null
}
