import { createCodedError } from '@vouchington/sentry'
import { NOT_FOUND } from '@modules/on-error/error-codes'
import { read, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isUUID, isUsername } from '@modules/utils'
import { getMinUUIDv7ForParentHistory } from '@modules/utils/ids'
import { enqueueReferralClickNotification } from '@queues/notifications/enqueues'

export async function createSessionReferralAttribution({
  sessionId,
  referrer,
  landingUrl,
  userId,
  utm,
}: {
  sessionId: string
  referrer: string
  landingUrl: string
  userId?: string | null
  utm?: {
    utmSource?: string | null
    utmMedium?: string | null
    utmCampaign?: string | null
    utmContent?: string | null
  } | null
}): Promise<void> {
  assert(/^https?:\/\//i.test(landingUrl), 400, 'Landing URL must use http or https')
  const referrerId = await getReferrerId(referrer)
  assert(referrerId, 404, 'Referrer not found')
  assert(referrerId !== userId, 400, 'Cannot refer yourself')

  await using query = await beginTransaction()
  const { rows } = await query<{
    exists: boolean
  }>(sql`/* createSessionReferralAttribution: earlier click */
    SELECT EXISTS (
      SELECT 1 FROM session_referral_attributions
      WHERE session_id = ${sessionId}
        AND referrer_user_id = ${referrerId}
        AND id >= ${getMinUUIDv7ForParentHistory(referrerId)}::uuid
    ) AS exists
  `)
  const inserted = await query(sql`/* createSessionReferralAttribution: append click */
    INSERT INTO session_referral_attributions (session_id, referrer_user_id, landing_url, user_id, utm_source, utm_medium, utm_campaign, utm_content)
    SELECT ${sessionId}, ${referrerId}, ${landingUrl}, ${userId ?? null}::uuid,
      ${utm?.utmSource ?? null}, ${utm?.utmMedium ?? null}, ${utm?.utmCampaign ?? null}, ${utm?.utmContent ?? null}
    WHERE ${userId ?? null}::uuid IS NULL OR EXISTS (
      SELECT 1 FROM users WHERE id = ${userId ?? null}::uuid AND deleted_at IS NULL
    )
  `)

  if (inserted.rowCount !== 1) throw createCodedError(404, 'User not found', NOT_FOUND)
  await query.commit()

  // Notification deduplication is best effort when the first clicks race.
  if (!rows[0]!.exists) await enqueueReferralClickNotification(referrerId)
}

async function getReferrerId(referrer: string): Promise<string | null> {
  if (isUUID(referrer)) {
    const { rows } = await read<{ id: string }>(sql`/* getReferrerId */
      SELECT id FROM users WHERE id = ${referrer} AND deleted_at IS NULL LIMIT 1
    `)
    return rows[0]?.id ?? null
  }
  if (isUsername(referrer)) {
    const { rows } = await read<{ id: string }>(sql`/* getReferrerId */
      SELECT id FROM users WHERE LOWER(username) = LOWER(${referrer}) AND deleted_at IS NULL LIMIT 1
    `)
    return rows[0]?.id ?? null
  }
  return null
}
