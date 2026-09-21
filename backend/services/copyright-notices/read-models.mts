/* oxlint-disable max-lines -- Copyright read projections keep redaction rules in one audited module. */
import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'

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

export async function listCopyrightStaffEmailIntakes(currentUser: PrivateUser): Promise<
  Array<{
    id: string
    received_at: Date
    parse_status: 'succeeded' | 'failed'
    recommendation_id: string | null
    review_path: 'initial' | 'unresolved_thread' | 'matched_thread'
    linked_notice_id: string | null
  }>
> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser)) return []
  await using transaction = await beginTransaction()
  const { rows } = await transaction<
    Array<{
      id: string
      received_at: Date
      parse_status: 'succeeded' | 'failed'
      recommendation_id: string | null
      link_kind: 'initial' | 'thread' | null
      linked_notice_id: string | null
      has_reply_reference: boolean
    }>[number]
  >(sql`/* listCopyrightStaffEmailIntakes */
    SELECT intake.id, intake.received_at, parse.status AS parse_status, recommendation.id AS recommendation_id,
      link.link_kind, link.copyright_notice_id AS linked_notice_id,
      EXISTS (
        SELECT 1 FROM copyright_notice_email_thread_references reference
        WHERE reference.copyright_notice_email_intake_id = intake.id
          AND reference.reference_kind = 'reply_reference'
      ) AS has_reply_reference
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_parses parse ON parse.copyright_notice_email_intake_id = intake.id
    LEFT JOIN LATERAL (SELECT id FROM copyright_notice_email_intake_recommendations WHERE copyright_notice_email_intake_id = intake.id ORDER BY id DESC LIMIT 1) recommendation ON true
    LEFT JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id
    WHERE NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review WHERE review.copyright_notice_email_intake_id = intake.id)
      AND (
        link.link_kind IS NULL
        OR (
          link.link_kind = 'thread'
          AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_email_correspondence_reviews review
            WHERE review.copyright_notice_email_intake_id = intake.id
              AND review.action IN ('admitted', 'rejected')
          )
        )
      )
    ORDER BY intake.received_at, intake.id LIMIT 100
  `)
  await transaction.commit()
  return rows.map(row => ({
    id: row.id,
    received_at: row.received_at,
    parse_status: row.parse_status,
    recommendation_id: row.recommendation_id,
    review_path:
      row.link_kind === 'thread'
        ? 'matched_thread'
        : row.has_reply_reference
          ? 'unresolved_thread'
          : 'initial',
    linked_notice_id: row.linked_notice_id,
  }))
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
    SELECT id, placement_key FROM copyright_notice_targets
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

export async function listAcceptedCopyrightNotices(): Promise<CopyrightPublicNotice[]> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightPublicNotice>(sql`/* listAcceptedCopyrightNotices */
    SELECT notice.id, notice.jurisdiction, notice.received_at, notice.accepted_at,
      notice.provisional_withholding_at, count(target.id)::integer AS target_count
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    WHERE notice.accepted_at IS NOT NULL
    GROUP BY notice.id
    ORDER BY notice.accepted_at DESC, notice.id DESC
    LIMIT 100
  `)
  await transaction.commit()
  return rows
}

export async function getCopyrightPublicNoticeDetail(
  noticeId: string,
): Promise<CopyrightPublicNoticeDetail | null> {
  await using transaction = await beginTransaction()
  const { rows: notices } =
    await transaction<CopyrightPublicNotice>(sql`/* getCopyrightPublicNotice */
    SELECT notice.id, notice.jurisdiction, notice.received_at, notice.accepted_at,
      notice.provisional_withholding_at, count(target.id)::integer AS target_count
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    WHERE notice.id = ${noticeId} AND notice.accepted_at IS NOT NULL
    GROUP BY notice.id
  `)
  const notice = notices[0]
  if (!notice) {
    await transaction.commit()
    return null
  }
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
        ON target.placement_key = concat('image-placement:', image_placement.placement_id)
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
      ORDER BY created_at, id
    `),
  ])
  await transaction.commit()
  return { ...notice, targets: targets.rows, timeline: timeline.rows }
}

export async function getCopyrightParticipantNoticeDetail(
  noticeId: string,
  currentUser: PrivateUser,
): Promise<CopyrightParticipantNoticeDetail | null> {
  const viewerRole = await getCopyrightNoticeViewerRole(noticeId, currentUser)
  if (!viewerRole) return null
  const detail = await getCopyrightPublicNoticeDetail(noticeId)
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
        ON target.placement_key = concat('image-placement:', placement.id)
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
          ON target.placement_key = concat('image-placement:', placement.id)
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
