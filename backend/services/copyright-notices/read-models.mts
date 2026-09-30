/* oxlint-disable max-lines -- Copyright read projections keep redaction rules in one audited module. */
import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import {
  copyrightTimelineEventTypesFor,
  type CopyrightTimelineAudience,
} from './timeline-visibility.mts'

export type CopyrightStaffEmailIntake = {
  id: string
  received_at: Date
  review_path: 'initial' | 'unresolved_thread' | 'matched_thread'
  linked_notice: {
    id: string
    targets: Array<{ id: string; placement_key: string }>
  } | null
  raw_email: { mime_type: string; byte_size: number; sha256: string; download_url: string }
  parsed_email: { sender_email: string; subject: string; body_text: string } | null
  parser_error: string | null
  recommendation: { id: string; structured_output: Record<string, unknown> } | null
}

export async function getCopyrightStaffEmailIntake(
  intakeId: string,
  currentUser: PrivateUser,
): Promise<CopyrightStaffEmailIntake | null> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser)) return null
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    ses_message_id: string
    received_at: Date
    raw_storage_key: string
    raw_mime_type: string
    raw_byte_size: number
    raw_sha256: Buffer
    sender_email_ciphertext: string | null
    subject_ciphertext: string | null
    body_ciphertext: string | null
    error_ciphertext: string | null
    recommendation_id: string | null
    structured_output_ciphertext: string | null
    link_kind: 'initial' | 'thread' | null
    linked_notice_id: string | null
    has_reply_reference: boolean
  }>(sql`/* getCopyrightStaffEmailIntake */
    SELECT intake.id, intake.ses_message_id, intake.received_at, intake.raw_storage_key, intake.raw_mime_type, intake.raw_byte_size, intake.raw_sha256,
      parse.sender_email_ciphertext, parse.subject_ciphertext, parse.body_ciphertext, parse.error_ciphertext,
      recommendation.id AS recommendation_id, recommendation.structured_output_ciphertext,
      link.link_kind, link.copyright_notice_id AS linked_notice_id,
      EXISTS (
        SELECT 1 FROM copyright_notice_email_thread_references reference
        WHERE reference.copyright_notice_email_intake_id = intake.id
          AND reference.reference_kind = 'reply_reference'
      ) AS has_reply_reference
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_email_intake_parses parse ON parse.copyright_notice_email_intake_id = intake.id
    LEFT JOIN LATERAL (SELECT id, structured_output_ciphertext FROM copyright_notice_email_intake_recommendations WHERE copyright_notice_email_intake_id = intake.id ORDER BY id DESC LIMIT 1) recommendation ON true
    LEFT JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id
    WHERE intake.id = ${intakeId}
  `)
  await transaction.commit()
  const row = rows[0]
  if (!row) return null
  const purpose = copyrightEmailIntakePurpose(row.ses_message_id)
  const reviewPath =
    row.link_kind === 'thread'
      ? 'matched_thread'
      : row.has_reply_reference
        ? 'unresolved_thread'
        : 'initial'
  const linkedNotice = row.linked_notice_id
    ? await getCopyrightEmailLinkedNotice(row.linked_notice_id)
    : null
  return {
    id: row.id,
    received_at: row.received_at,
    review_path: reviewPath,
    linked_notice: linkedNotice,
    raw_email: {
      mime_type: row.raw_mime_type,
      byte_size: row.raw_byte_size,
      sha256: row.raw_sha256.toString('hex'),
      download_url: `/api/v1/copyright-email-intakes/${row.id}/raw`,
    },
    parsed_email:
      row.sender_email_ciphertext && row.subject_ciphertext && row.body_ciphertext
        ? {
            sender_email: decryptSecret(row.sender_email_ciphertext, purpose),
            subject: decryptSecret(row.subject_ciphertext, purpose),
            body_text: decryptSecret(row.body_ciphertext, purpose),
          }
        : null,
    parser_error: row.error_ciphertext ? decryptSecret(row.error_ciphertext, purpose) : null,
    recommendation:
      row.recommendation_id && row.structured_output_ciphertext
        ? {
            id: row.recommendation_id,
            structured_output: JSON.parse(
              decryptSecret(row.structured_output_ciphertext, purpose),
            ) as Record<string, unknown>,
          }
        : null,
  }
}

async function getCopyrightEmailLinkedNotice(noticeId: string): Promise<{
  id: string
  targets: Array<{ id: string; placement_key: string }>
} | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    placement_key: string
  }>(sql`/* getCopyrightEmailLinkedNotice */
    SELECT id, concat('image-placement:', placement_id) AS placement_key FROM copyright_notice_targets
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  await transaction.commit()
  return rows.length > 0 ? { id: noticeId, targets: rows } : null
}

export type CopyrightPublicNotice = {
  id: string
  jurisdiction: 'us_dmca'
  received_at: Date
  accepted_at: Date
  provisional_withholding_at: Date | null
  target_count: number
  claimant: { user_id: string; display_name: string } | null
}

export type CopyrightPublicNoticeDetail = CopyrightPublicNotice & {
  targets: Array<{
    id: string
    hosted_use_url: string | null
    restriction_status: 'active' | 'lifted' | 'pending'
  }>
  timeline: Array<{ id: string; event_type: string; created_at: Date }>
}

export type CopyrightParticipantNoticeDetail = CopyrightPublicNoticeDetail & {
  viewer_role: 'claimant' | 'poster' | 'staff'
  respondable_target_ids: string[]
  submissions: Array<{ id: string; kind: string; received_at: Date; source_kind: string }>
}

export type CopyrightAcceptedNoticeCursorRow = CopyrightPublicNotice & {
  cursor_accepted_at: string
}

type CopyrightPublicNoticeRow = Omit<CopyrightPublicNotice, 'claimant'> & {
  claimant_user_id: string | null
  public_claimant_display_name: string | null
}

type CopyrightAcceptedNoticeCursorDatabaseRow = CopyrightPublicNoticeRow & {
  cursor_accepted_at: string
}

export const copyrightAcceptedNoticeCursorScope = 'copyright-notices:accepted-at-desc-id-desc'

export async function listAcceptedCopyrightNotices(options: {
  limit: number
  after?: { timestamp: string; id: string }
}): Promise<{ notices: CopyrightAcceptedNoticeCursorRow[]; hasNextPage: boolean }> {
  await using transaction = await beginTransaction()
  const query = sql`/* listAcceptedCopyrightNotices */
    SELECT notice.id, notice.jurisdiction, notice.received_at, notice.accepted_at,
      notice.provisional_withholding_at, count(target.id)::integer AS target_count,
      claimant.id AS claimant_user_id,
      COALESCE(claimant.display_account->>'name', claimant.username, 'Voucha member')
        AS public_claimant_display_name,
      to_char(
        notice.accepted_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_accepted_at
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    LEFT JOIN view_users_public claimant ON claimant.id = notice.claimant_user_id
    WHERE notice.accepted_at IS NOT NULL
  `
  if (options.after) {
    query.append(sql`
      AND (notice.accepted_at, notice.id) < (${options.after.timestamp}::timestamptz, ${options.after.id})`)
  }
  query.append(sql`
    GROUP BY notice.id, claimant.id, claimant.display_account, claimant.username
    ORDER BY notice.accepted_at DESC, notice.id DESC
    LIMIT ${options.limit + 1}
  `)
  const { rows } = await transaction<CopyrightAcceptedNoticeCursorDatabaseRow>(query)
  await transaction.commit()
  return {
    notices: rows.slice(0, options.limit).map(toCopyrightAcceptedNoticeCursorRow),
    hasNextPage: rows.length > options.limit,
  }
}

/**
 * The member-visible case. Its timeline is the audience allowlist in `timeline-visibility.mts`;
 * only the participant read model widens it, for staff.
 */
export async function getCopyrightPublicNoticeDetail(
  noticeId: string,
  timelineAudience: CopyrightTimelineAudience = 'member',
): Promise<CopyrightPublicNoticeDetail | null> {
  const timelineEventTypes = copyrightTimelineEventTypesFor(timelineAudience)
  await using transaction = await beginTransaction()
  const { rows: notices } =
    await transaction<CopyrightPublicNoticeRow>(sql`/* getCopyrightPublicNotice */
    SELECT notice.id, notice.jurisdiction, notice.received_at, notice.accepted_at,
      notice.provisional_withholding_at, count(target.id)::integer AS target_count,
      claimant.id AS claimant_user_id,
      COALESCE(claimant.display_account->>'name', claimant.username, 'Voucha member')
        AS public_claimant_display_name
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    LEFT JOIN view_users_public claimant ON claimant.id = notice.claimant_user_id
    WHERE notice.id = ${noticeId} AND notice.accepted_at IS NOT NULL
    GROUP BY notice.id, claimant.id, claimant.display_account, claimant.username
  `)
  const noticeRow = notices[0]
  if (!noticeRow) {
    await transaction.commit()
    return null
  }
  const notice = toCopyrightPublicNotice(noticeRow)
  const [targets, timeline] = await Promise.all([
    transaction<
      CopyrightPublicNoticeDetail['targets'][number]
    >(sql`/* getCopyrightPublicNotice:targets */
      SELECT target.id,
        CASE WHEN public_post.post_id IS NOT NULL THEN target.hosted_use_url ELSE NULL END AS hosted_use_url,
        CASE
          WHEN restriction.id IS NULL THEN 'pending'
          WHEN restriction.lifted_at IS NULL THEN 'active'
          ELSE 'lifted'
        END AS restriction_status
      FROM copyright_notice_targets target
      LEFT JOIN image_placements image_placement
        ON target.placement_id = image_placement.placement_id
      LEFT JOIN view_public_post_eligibility public_post
        ON public_post.post_id = image_placement.post_id
      LEFT JOIN LATERAL (
        SELECT current_restriction.id, current_restriction.lifted_at
        FROM copyright_restrictions current_restriction
        WHERE current_restriction.copyright_notice_target_id = target.id
        ORDER BY current_restriction.created_at DESC, current_restriction.id DESC
        LIMIT 1
      ) restriction ON true
      WHERE target.copyright_notice_id = ${noticeId}
      ORDER BY target.id
    `),
    transaction<
      CopyrightPublicNoticeDetail['timeline'][number]
    >(sql`/* getCopyrightPublicNotice:timeline */
      SELECT id, event_type, created_at
      FROM copyright_notice_lifecycle_events
      WHERE copyright_notice_id = ${noticeId}
        AND (${timelineEventTypes}::text[] IS NULL OR event_type = ANY(${timelineEventTypes}::text[]))
      ORDER BY created_at, id
    `),
  ])
  await transaction.commit()
  return { ...notice, targets: targets.rows, timeline: timeline.rows }
}

function toCopyrightAcceptedNoticeCursorRow(
  row: CopyrightAcceptedNoticeCursorDatabaseRow,
): CopyrightAcceptedNoticeCursorRow {
  return { ...toCopyrightPublicNotice(row), cursor_accepted_at: row.cursor_accepted_at }
}

function toCopyrightPublicNotice(row: CopyrightPublicNoticeRow): CopyrightPublicNotice {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    received_at: row.received_at,
    accepted_at: row.accepted_at,
    provisional_withholding_at: row.provisional_withholding_at,
    target_count: row.target_count,
    claimant: row.claimant_user_id
      ? {
          user_id: row.claimant_user_id,
          display_name: row.public_claimant_display_name ?? 'Voucha member',
        }
      : null,
  }
}

export async function getCopyrightParticipantNoticeDetail(
  noticeId: string,
  currentUser: PrivateUser,
): Promise<CopyrightParticipantNoticeDetail | null> {
  const viewerRole = await getCopyrightNoticeViewerRole(noticeId, currentUser)
  if (!viewerRole) return null
  const detail = await getCopyrightPublicNoticeDetail(
    noticeId,
    viewerRole === 'staff' ? 'staff' : 'member',
  )
  if (!detail) return null
  await using transaction = await beginTransaction()
  const [{ rows: submissions }, { rows: respondableTargets }] = await Promise.all([
    transaction<CopyrightParticipantNoticeDetail['submissions'][number]>(
      sql`/* getCopyrightParticipantNoticeDetail:submissions */
      SELECT id, kind, received_at, source_kind
      FROM copyright_notice_submissions
      WHERE copyright_notice_id = ${noticeId}
        AND (${viewerRole === 'staff'} OR submitted_by_user_id = ${currentUser.id})
      ORDER BY received_at, id
    `,
    ),
    transaction<{ id: string }>(sql`/* getCopyrightParticipantNoticeDetail:respondableTargets */
      SELECT DISTINCT target.id
      FROM copyright_notice_targets target
      JOIN media_placements placement
        ON target.placement_id = placement.id
      JOIN image_placements image_placement ON image_placement.placement_id = placement.id
      JOIN posts post ON post.id = image_placement.post_id
      WHERE target.copyright_notice_id = ${noticeId}
        AND post.created_by_id = ${currentUser.id}
      ORDER BY target.id
    `),
  ])
  await transaction.commit()
  return {
    ...detail,
    viewer_role: viewerRole,
    respondable_target_ids: respondableTargets.map(target => target.id),
    submissions,
  }
}

async function getCopyrightNoticeViewerRole(
  noticeId: string,
  currentUser: PrivateUser,
): Promise<'claimant' | 'poster' | 'staff' | null> {
  if (currentUserCanReviewCopyrightNotices(currentUser)) return 'staff'
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    role: 'claimant' | 'poster'
  }>(sql`/* getCopyrightNoticeViewerRole */
    SELECT CASE
      WHEN notice.claimant_user_id = ${currentUser.id} THEN 'claimant'
      WHEN EXISTS (
        SELECT 1 FROM copyright_notice_targets target
        JOIN media_placements placement
          ON target.placement_id = placement.id
        JOIN image_placements image_placement ON image_placement.placement_id = placement.id
        JOIN posts post ON post.id = image_placement.post_id
        WHERE target.copyright_notice_id = notice.id AND post.created_by_id = ${currentUser.id}
      ) THEN 'poster'
      ELSE NULL
    END AS role
    FROM copyright_notices notice
    WHERE notice.id = ${noticeId}
  `)
  await transaction.commit()
  return rows[0]?.role ?? null
}
