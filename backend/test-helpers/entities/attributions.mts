import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function setUserReferrerId(userId: string, referrerId: string): Promise<void> {
  await write(
    sql`/* setUserReferrerId */
    UPDATE users SET referrer_user_id = ${referrerId} WHERE id = ${userId}
  `,
  )
}

export async function getUserReferrerId(userId: string): Promise<string | null> {
  const { rows } = await read<{ referrer_user_id: string | null }>(
    sql`/* getUserReferrerId */
    SELECT referrer_user_id
    FROM users
    WHERE id = ${userId}
  `,
  )
  return rows[0]?.referrer_user_id ?? null
}

export async function insertSessionReferralAttribution(
  sessionId: string,
  referrerId: string,
  landingUrl = 'https://example.com/',
  userId: string | null = null,
): Promise<void> {
  await write(
    sql`/* insertSessionReferralAttribution */
    INSERT INTO session_referral_attributions (session_id, referrer_user_id, landing_url, user_id)
    VALUES (${sessionId}, ${referrerId}, ${landingUrl}, ${userId})
  `,
  )
}

/** Inserts one retained click with an explicit session and UUIDv7 time. */
export async function insertAnonymousReferralAttributionForSessionAt(
  sessionId: string,
  referrerId: string,
  createdAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: createdAt.getTime() })
  await write(
    sql`/* insertAnonymousReferralAttributionForSessionAt */
    INSERT INTO session_referral_attributions (id, session_id, referrer_user_id, landing_url)
    VALUES (${id}, ${sessionId}, ${referrerId}, ${'https://example.com/'})
  `,
  )
  return id
}

export async function deleteReferralAttributionsByIds(ids: string[]): Promise<void> {
  await write(sql`/* deleteReferralAttributionsByIds */
    DELETE FROM session_referral_attributions WHERE id = ANY(${ids}::uuid[])
  `)
}

export async function getSessionReferralAttributions(sessionId: string) {
  const { rows } = await read(
    sql`/* getSessionReferralAttributions */
    SELECT id, session_id, referrer_user_id, landing_url, user_id, signed_up_at
    FROM session_referral_attributions
    WHERE session_id = ${sessionId}
    ORDER BY id ASC
  `,
  )
  return rows as Array<{
    id: string
    session_id: string
    referrer_user_id: string | null
    landing_url: string
    user_id: string | null
    signed_up_at: Date | null
  }>
}

export async function getSessionReferralAttributionsWithUtm(sessionId: string) {
  const { rows } = await read(
    sql`/* getSessionReferralAttributionsWithUtm */
    SELECT session_id, referrer_user_id, landing_url, user_id, utm_source, utm_medium, utm_campaign, utm_content
    FROM session_referral_attributions
    WHERE session_id = ${sessionId}
    ORDER BY id ASC
  `,
  )
  return rows as Array<{
    session_id: string
    referrer_user_id: string | null
    landing_url: string
    user_id: string | null
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_content: string | null
  }>
}
