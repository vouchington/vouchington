import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function setUserReferrerId(userId: string, referrerId: string): Promise<void> {
  await write(sql`
    UPDATE users SET referrer_id = ${referrerId} WHERE id = ${userId}
  `)
}

export async function getUserReferrerId(userId: string): Promise<string | null> {
  const { rows } = await read(sql`
    SELECT referrer_id
    FROM users
    WHERE id = ${userId}
  `)
  return rows[0]?.referrer_id ?? null
}

export async function insertSessionReferralAttribution(
  sessionId: string,
  referrerId: string,
  landingUrl = 'https://example.com/',
  userId: string | null = null,
): Promise<void> {
  await write(sql`
    INSERT INTO session_referral_attributions (session_id, referrer_id, landing_url, user_id)
    VALUES (${sessionId}, ${referrerId}, ${landingUrl}, ${userId})
  `)
}

export async function insertOldAnonymousReferralAttribution(
  referrerId: string,
  daysOld: number,
): Promise<string> {
  const oldDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
  return await insertReferralAttributionAt(referrerId, oldDate)
}

// General retention-fixture insert: lets a test control user_id/signed_up_at directly, e.g. to
// model a user-linked row (retained regardless of age) or a converted row whose user was later
// deleted (user_id nulled by the FK's ON DELETE SET NULL, which drops it back into the sweep).
export async function insertReferralAttributionAt(
  referrerId: string,
  createdAt: Date,
  userId: string | null = null,
  signedUpAt: Date | null = null,
): Promise<string> {
  const id = uuidv7({ msecs: createdAt.getTime() })
  await write(sql`
    INSERT INTO session_referral_attributions
      (id, session_id, referrer_id, landing_url, user_id, signed_up_at)
    VALUES (${id}, ${uuidv7()}, ${referrerId}, ${'https://example.com/'}, ${userId}, ${signedUpAt})
  `)
  return id
}

// Same as insertReferralAttributionAt but pinned to a caller-supplied session_id, so a
// test can model a repeat click "moving" a row to a fresh id within the same session.
export async function insertAnonymousReferralAttributionForSessionAt(
  sessionId: string,
  referrerId: string,
  createdAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: createdAt.getTime() })
  await write(sql`
    INSERT INTO session_referral_attributions (id, session_id, referrer_id, landing_url)
    VALUES (${id}, ${sessionId}, ${referrerId}, ${'https://example.com/'})
  `)
  return id
}

export async function clearReferralAttributionUserId(id: string): Promise<void> {
  await write(sql`
    UPDATE session_referral_attributions SET user_id = NULL WHERE id = ${id}
  `)
}

export async function referralAttributionExistsById(id: string): Promise<boolean> {
  const { rows } = await read(sql`
    SELECT id FROM session_referral_attributions WHERE id = ${id}
  `)
  return rows.length > 0
}

export async function getSessionReferralAttributions(sessionId: string) {
  const { rows } = await read(sql`
    SELECT id, session_id, referrer_id, landing_url, user_id, signed_up_at
    FROM session_referral_attributions
    WHERE session_id = ${sessionId}
    ORDER BY id ASC
  `)
  return rows as Array<{
    id: string
    session_id: string
    referrer_id: string | null
    landing_url: string
    user_id: string | null
    signed_up_at: Date | null
  }>
}

export async function getSessionReferralAttributionsWithUtm(sessionId: string) {
  const { rows } = await read(sql`
    SELECT session_id, referrer_id, landing_url, user_id, utm_source, utm_medium, utm_campaign, utm_content
    FROM session_referral_attributions
    WHERE session_id = ${sessionId}
    ORDER BY id ASC
  `)
  return rows as Array<{
    session_id: string
    referrer_id: string | null
    landing_url: string
    user_id: string | null
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_content: string | null
  }>
}
