import { read } from '@data-stores/psql'
import { getUsersWorkLimit } from '@services/users/work-limits'
import sql from 'sql-template-strings'
import { getEngagementEmailsWorkLimit } from './work-limits.mts'

export type EngagementEmailType = 'follow_topics' | 'post_referral_link' | 'follow_news_sources'
export type EngagementRecipient = {
  id: string
  email_address: string
  username: string | null
  ui_locale: string | null
}
export type EngagementRecipientCursor = {
  lane: 'unclaimed' | 'claimed'
  afterUserId: string
  /** PostgreSQL timestamp text preserves the receipt's microseconds across pages. */
  afterClaimedAt?: string
}
export type EngagementRecipientPage = {
  recipients: EngagementRecipient[]
  scannedCount: number
  nextCursor?: EngagementRecipientCursor
}
export type PreparedEngagementRecipientPage = {
  recipientIds: string[]
  scannedCount: number
  nextCursor?: EngagementRecipientCursor
}

const FIRST_USER_ID = '00000000-0000-0000-0000-000000000000'

function typeLiteral(type: EngagementEmailType) {
  if (type === 'follow_topics') return sql`'follow_topics'`
  if (type === 'post_referral_link') return sql`'post_referral_link'`
  return sql`'follow_news_sources'`
}

function sourceEligibility(type: EngagementEmailType, dispatchStartedAt: Date) {
  if (type === 'follow_topics')
    return sql`NOT EXISTS (
    SELECT 1 FROM relation__user__follow__topic relation
    WHERE relation.subject_id = u.id AND relation.deleted_at IS NULL
  )`
  if (type === 'post_referral_link')
    return sql`NOT EXISTS (
    SELECT 1 FROM user_referral_program_links link
    WHERE link.user_id = u.id AND link.deleted_at IS NULL AND link.activated_at IS NOT NULL
  ) AND COALESCE((
    SELECT 1 FROM user_engagement_email_sends prior
    WHERE prior.user_id = u.id AND prior.email_type = 'follow_topics'
      AND prior.claimed_at >= ${dispatchStartedAt}
    LIMIT 1
  ), 0) = 0`
  return sql`NOT EXISTS (
    SELECT 1 FROM relation__user__follow__rss_feed relation
    WHERE relation.subject_id = u.id AND relation.deleted_at IS NULL
  ) AND COALESCE((
    SELECT 1 FROM user_engagement_email_sends prior
    WHERE prior.user_id = u.id AND prior.email_type IN ('follow_topics', 'post_referral_link')
      AND prior.claimed_at >= ${dispatchStartedAt}
    LIMIT 1
  ), 0) = 0`
}

export async function readEngagementRecipientPage(input: {
  type: EngagementEmailType
  dispatchStartedAt: Date
  userIds?: readonly string[]
  cursor?: EngagementRecipientCursor
  asOf?: Date
  rawLimit?: number
  eligibleLimit?: number
}): Promise<EngagementRecipientPage> {
  const {
    type,
    dispatchStartedAt,
    userIds,
    cursor,
    asOf,
    rawLimit = getEngagementEmailsWorkLimit('dispatch_batch_size'),
    eligibleLimit = getEngagementEmailsWorkLimit('dispatch_batch_size'),
  } = input
  if (!Number.isFinite(dispatchStartedAt.getTime()) || (asOf && !Number.isFinite(asOf.getTime())))
    throw new RangeError('Invalid engagement email selection time')
  if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 5_000)
    throw new RangeError('Invalid engagement raw selection page size')
  if (!Number.isSafeInteger(eligibleLimit) || eligibleLimit < 1 || eligibleLimit > 2_500)
    throw new RangeError('Invalid engagement recipient page size')
  if (userIds?.length === 0) return { recipients: [], scannedCount: 0 }

  const claimed = cursor?.lane === 'claimed'
  const claimHours = getUsersWorkLimit('engagement_claim_hours')
  const raw = claimed
    ? sql`SELECT candidate.user_id, candidate.claimed_at,
      candidate.claimed_at::text AS claimed_at_cursor
    FROM user_engagement_email_candidates candidate WHERE candidate.email_type = `
    : sql`SELECT candidate.user_id, NULL::timestamptz AS claimed_at,
      NULL::text AS claimed_at_cursor
    FROM user_engagement_email_candidates candidate WHERE candidate.email_type = `
  raw.append(typeLiteral(type))
  if (claimed) {
    raw.append(sql` AND candidate.claimed_at < `)
    raw.append(asOf ? sql`${asOf}::timestamptz` : sql`CURRENT_TIMESTAMP`)
    raw.append(sql` - ${claimHours}::integer * INTERVAL '1 hour'
      AND (candidate.claimed_at, candidate.user_id) >
        (${cursor?.afterClaimedAt ?? '-infinity'}::timestamptz,
         ${cursor?.afterUserId ?? FIRST_USER_ID}::uuid)`)
  } else {
    raw.append(sql` AND candidate.claimed_at IS NULL
      AND candidate.user_id > ${cursor?.afterUserId ?? FIRST_USER_ID}::uuid`)
  }
  if (userIds) raw.append(sql` AND candidate.user_id = ANY(${userIds}::uuid[])`)
  raw.append(
    claimed
      ? sql` ORDER BY candidate.email_type, candidate.claimed_at, candidate.user_id LIMIT ${rawLimit + 1}`
      : sql` ORDER BY candidate.email_type, candidate.user_id LIMIT ${rawLimit + 1}`,
  )

  const query = sql`/* readEngagementRecipientPage */ WITH raw AS MATERIALIZED (`
    .append(raw)
    .append(sql`) SELECT raw.user_id AS id, raw.claimed_at_cursor,
      address.email_address, u.username, u.ui_locale,
      (u.id IS NOT NULL AND address.user_id IS NOT NULL
       AND u.deleted_at IS NULL AND u.is_engagement_emails_enabled = TRUE
       AND u.processing_restricted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM user_suspensions suspension
         WHERE suspension.user_id = u.id AND suspension.lifted_at IS NULL
       ) AND `)
    .append(sourceEligibility(type, dispatchStartedAt)).append(sql`) AS eligible
      FROM raw
      LEFT JOIN users u ON u.id = raw.user_id
      LEFT JOIN user_email_addresses address
        ON address.user_id = u.id AND address.is_primary = TRUE
      ORDER BY raw.claimed_at ASC NULLS FIRST, raw.user_id ASC`)
  const { rows } = await read<
    EngagementRecipient & { eligible: boolean; claimed_at_cursor: string | null }
  >(query)
  const scanned = rows.slice(0, rawLimit)
  const recipients = scanned
    .filter(row => row.eligible)
    .slice(0, eligibleLimit)
    .map(({ id, email_address, username, ui_locale }) => ({
      id,
      email_address,
      username,
      ui_locale,
    }))
  const last = scanned.at(-1)
  const nextCursor: EngagementRecipientCursor | undefined =
    recipients.length >= eligibleLimit
      ? undefined
      : rows.length > rawLimit && last
        ? {
            lane: claimed ? 'claimed' : 'unclaimed',
            afterUserId: last.id,
            ...(claimed && last.claimed_at_cursor
              ? { afterClaimedAt: last.claimed_at_cursor }
              : {}),
          }
        : claimed
          ? undefined
          : { lane: 'claimed', afterUserId: FIRST_USER_ID }
  return { recipients, scannedCount: scanned.length, ...(nextCursor && { nextCursor }) }
}

/** Replays only the bounded IDs durably selected before this dispatcher page claimed them. */
export async function readPreparedEngagementRecipients(input: {
  type: EngagementEmailType
  dispatchStartedAt: Date
  recipientIds: readonly string[]
}): Promise<EngagementRecipient[]> {
  if (input.recipientIds.length === 0) return []
  if (input.recipientIds.length > 2_500)
    throw new RangeError('Invalid prepared recipient page size')
  const query = sql`/* readPreparedEngagementRecipients */ SELECT u.id, address.email_address,
      u.username, u.ui_locale
    FROM UNNEST(${input.recipientIds}::uuid[]) WITH ORDINALITY selected(user_id, position)
    JOIN user_engagement_email_candidates candidate
      ON candidate.user_id = selected.user_id AND candidate.email_type = `
    .append(typeLiteral(input.type))
    .append(sql`
    JOIN users u ON u.id = selected.user_id
    JOIN user_email_addresses address ON address.user_id = u.id AND address.is_primary = TRUE
    WHERE u.deleted_at IS NULL AND u.is_engagement_emails_enabled = TRUE
      AND u.processing_restricted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = u.id AND suspension.lifted_at IS NULL
      ) AND `)
    .append(sourceEligibility(input.type, input.dispatchStartedAt))
    .append(sql` ORDER BY selected.position`)
  const { rows } = await read<EngagementRecipient>(query)
  return rows
}
