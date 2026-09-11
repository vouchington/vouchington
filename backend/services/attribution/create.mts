import { read, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isUUID, isUsername } from '@modules/utils'
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

  // Dedup on (session_id, referrer_id): a repeat click replaces the prior row with a
  // fresh id, moving it to the front of both the 30-day retention sweep and the
  // recency-ordered click log — see docs/overview/architecture/partitioning-strategy.md.
  // ON CONFLICT is unavailable here: a unique index on a RANGE(id)-partitioned table
  // must include the partition key, so (session_id, referrer_id) can't be made unique.
  //
  // A converted row (signed_up_at set) is frozen instead of moved: minting a new id
  // would make created_at (uuid_extract_timestamp(id)) postdate signed_up_at, which
  // would read as "the click happened after the signup it caused" in the click log and
  // the GDPR export.
  await using query = await beginTransaction()
  await query(sql`/* createSessionReferralAttribution: lock pair */
    SELECT pg_advisory_xact_lock(hashtextextended(${sessionReferralAttributionPairKey(sessionId, referrerId)}, 0))
  `)
  const { rows: priorRows } = await query<{ user_id: string | null }>(
    sql`/* createSessionReferralAttribution: read prior candidate owners */
      SELECT user_id FROM session_referral_attributions
      WHERE session_id = ${sessionId}
        AND referrer_id = ${referrerId}
        AND signed_up_at IS NULL
    `,
  )
  const candidateUserIds = new Set(
    [userId, ...priorRows.map(row => row.user_id)].filter(
      (id): id is string => typeof id === 'string',
    ),
  )
  const lockedUserIds = [...candidateUserIds].toSorted()
  const activeOwnerIds = new Set<string>()
  for (const candidateUserId of lockedUserIds) {
    if (candidateUserId === userId) {
      // oxlint-disable-next-line no-await-in-loop -- locks are ordered by user id before the attribution mutation.
      await query(
        sql`/* createSessionReferralAttribution */ SELECT fn_lock_active_user_for_mutation(${candidateUserId})`,
      )
      activeOwnerIds.add(candidateUserId)
      continue
    }
    // oxlint-disable-next-line no-await-in-loop -- locks are ordered by user id before the attribution mutation.
    const { rowCount } = await query(
      sql`/* createSessionReferralAttribution: lock prior owner if still active */
        SELECT fn_lock_active_user_for_mutation(users.id)
        FROM users
        WHERE users.id = ${candidateUserId}
          AND users.deleted_at IS NULL
      `,
    )
    if ((rowCount ?? 0) > 0) activeOwnerIds.add(candidateUserId)
  }
  const { rows: replacedRows } = await query<{
    user_id: string | null
  }>(sql`/* createSessionReferralAttribution: remove prior unconverted click for this pair */
    DELETE FROM session_referral_attributions
    WHERE session_id = ${sessionId}
      AND referrer_id = ${referrerId}
      AND signed_up_at IS NULL
    RETURNING user_id
  `)

  let hasConvertedRow = false
  if (replacedRows.length === 0) {
    const { rows: convertedRows } =
      await query(sql`/* createSessionReferralAttribution: check for a frozen converted row */
      SELECT 1 FROM session_referral_attributions
      WHERE session_id = ${sessionId}
        AND referrer_id = ${referrerId}
        AND signed_up_at IS NOT NULL
      LIMIT 1
    `)
    hasConvertedRow = convertedRows.length > 0
  }

  const isNewPair = replacedRows.length === 0 && !hasConvertedRow
  if (!hasConvertedRow) {
    // A raced duplicate pair (see README) can leave more than one prior row; take the
    // first non-null user_id across all of them rather than indexing [0], so credit
    // isn't silently dropped if only one of the raced rows carried it.
    const priorUserId = replacedRows.find(
      row => row.user_id !== null && activeOwnerIds.has(row.user_id),
    )?.user_id
    await query(sql`/* createSessionReferralAttribution: insert click (new or moved-to-latest) */
      INSERT INTO session_referral_attributions (session_id, referrer_id, landing_url, user_id, utm_source, utm_medium, utm_campaign, utm_content)
      VALUES (${sessionId}, ${referrerId}, ${landingUrl}, ${userId ?? priorUserId ?? null}, ${utm?.utmSource ?? null}, ${utm?.utmMedium ?? null}, ${utm?.utmCampaign ?? null}, ${utm?.utmContent ?? null})
    `)
  }

  await query.commit()

  // Only a genuinely new (session, referrer) pair notifies — a moved or frozen row
  // already notified the referrer on its original click.
  if (isNewPair) void enqueueReferralClickNotification(referrerId, landingUrl)
}

async function getReferrerId(referrer: string): Promise<string | null> {
  if (isUUID(referrer)) {
    const { rows } = await read(sql`/* getReferrerId */
      SELECT id FROM users WHERE id = ${referrer} AND deleted_at IS NULL LIMIT 1
    `)
    return rows[0]?.id ?? null
  }
  if (isUsername(referrer)) {
    const { rows } = await read(sql`/* getReferrerId */
      SELECT id FROM users WHERE LOWER(username) = LOWER(${referrer}) AND deleted_at IS NULL LIMIT 1
    `)
    return rows[0]?.id ?? null
  }
  return null
}

function sessionReferralAttributionPairKey(sessionId: string, referrerId: string): string {
  return `session-referral-attribution:${sessionId}:${referrerId}`
}
