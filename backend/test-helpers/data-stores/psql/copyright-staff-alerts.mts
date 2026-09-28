import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CopyrightStaffAlertCase = {
  noticeId: string
  restrictionId: string
  workDescription: string
  claimantContactCiphertext: string
}

export async function insertCopyrightStaffAlertCase(input: {
  imageId: string
  actorUserId: string
  provisional: boolean
  noticeId?: string
}): Promise<CopyrightStaffAlertCase> {
  const workDescription = `work-${randomUUID()}`
  const claimantContactCiphertext = `contact-${randomUUID()}`
  const placementKey = `post-image:${randomUUID()}`
  const { rows } = await write<{ notice_id: string; restriction_id: string }>(
    sql`/* insertCopyrightStaffAlertCase */
      WITH notice AS (
        INSERT INTO copyright_notices (
          id, jurisdiction, legal_basis, received_at, accepted_at, provisional_withholding_at,
          claimant_contact_ciphertext, work_description, policy_version
        ) VALUES (
          COALESCE(${input.noticeId ?? null}::uuid, uuidv7()), 'us_dmca', 'copyright',
          CURRENT_TIMESTAMP - INTERVAL '2 days',
          CASE WHEN ${input.provisional} THEN CURRENT_TIMESTAMP - INTERVAL '1 day' ELSE NULL END,
          CASE WHEN ${input.provisional} THEN CURRENT_TIMESTAMP - INTERVAL '1 day' ELSE NULL END,
          ${claimantContactCiphertext}, ${workDescription}, 'test-v1'
        ) RETURNING id
      ), target AS (
        INSERT INTO copyright_notice_targets (
          copyright_notice_id, placement_key, placement_revision, hosted_use_url
        )
        SELECT id, ${placementKey}, 1, ${`https://voucha.ai/posts/${placementKey}`} FROM notice
        RETURNING id, copyright_notice_id
      ), linked_image AS (
        INSERT INTO copyright_notice_target_images (copyright_notice_target_id, image_id)
        SELECT id, ${input.imageId} FROM target
      ), submission AS (
        INSERT INTO copyright_notice_submissions (
          copyright_notice_id, kind, received_at, source_kind, body_ciphertext
        )
        SELECT copyright_notice_id, 'notice', CURRENT_TIMESTAMP, 'staff', ${`body-${randomUUID()}`}
        FROM target RETURNING id
      ), assessment AS (
        INSERT INTO copyright_notice_submission_assessments (
          copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
        )
        SELECT id, CURRENT_TIMESTAMP, ${input.actorUserId}, true FROM submission RETURNING id
      ), restriction AS (
        INSERT INTO copyright_restrictions (
          authorizing_assessment_id, copyright_notice_target_id, imposed_at, imposed_by_id
        )
        SELECT assessment.id, target.id, CURRENT_TIMESTAMP, ${input.actorUserId}
        FROM assessment CROSS JOIN target RETURNING id
      )
      SELECT notice.id AS notice_id, restriction.id AS restriction_id
      FROM notice CROSS JOIN restriction`,
  )
  const row = rows[0]
  if (!row) throw new Error('Copyright staff alert case was not inserted')
  return {
    noticeId: row.notice_id,
    restrictionId: row.restriction_id,
    workDescription,
    claimantContactCiphertext,
  }
}

export async function insertMissedCopyrightDeadline(input: {
  noticeId: string
  actorUserId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertMissedCopyrightDeadline */
    WITH submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${input.noticeId}, 'counter_notice', CURRENT_TIMESTAMP - INTERVAL '30 days', 'staff',
        ${`counter-${randomUUID()}`}
      ) RETURNING id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
      )
      SELECT id, CURRENT_TIMESTAMP - INTERVAL '20 days', ${input.actorUserId}, true FROM submission
      RETURNING id
    )
    INSERT INTO copyright_notice_deadlines (
      copyright_notice_id, qualifying_counter_notice_assessment_id, earliest_restoration_at,
      escalation_at, restoration_deadline_at
    )
    SELECT ${input.noticeId}, id, CURRENT_TIMESTAMP - INTERVAL '20 days',
      CURRENT_TIMESTAMP - INTERVAL '6 days', CURRENT_TIMESTAMP - INTERVAL '5 days'
    FROM assessment RETURNING id`)
  const deadlineId = rows[0]?.id
  if (!deadlineId) throw new Error('Missed copyright deadline was not inserted')
  return deadlineId
}

export async function insertCopyrightStaffAlertDelivery(
  noticeId: string,
  recipientUserId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertCopyrightStaffAlertDelivery */
    INSERT INTO copyright_notice_delivery_intents (
      copyright_notice_id, recipient_user_id, recipient_role, delivery_kind, channel, idempotency_key
    ) VALUES (
      ${noticeId}, ${recipientUserId}, 'poster', 'poster_restriction_notice', 'in_app',
      ${`alert-delivery-${randomUUID()}`}
    ) RETURNING id`)
  const intentId = rows[0]?.id
  if (!intentId) throw new Error('Copyright staff alert delivery was not inserted')
  return intentId
}

export async function markCopyrightStaffAlertDelivery(input: {
  intentId: string
  kind: 'failed' | 'bounced' | 'reconciliation'
  failureCiphertext?: string
}): Promise<void> {
  const failureCiphertext = input.failureCiphertext ?? null
  const { rowCount } = await write(sql`/* markCopyrightStaffAlertDelivery */
    UPDATE copyright_notice_delivery_intents
    SET state = CASE
        WHEN ${input.kind} = 'failed' THEN 'failed'
        WHEN ${input.kind} = 'bounced' THEN 'bounced'
        ELSE 'pending' END,
      delivery_attempted_at = CURRENT_TIMESTAMP,
      delivery_attempt_count = CASE WHEN ${input.kind} = 'failed' THEN 5 ELSE 1 END,
      sent_at = CASE WHEN ${input.kind} = 'bounced' THEN CURRENT_TIMESTAMP ELSE NULL END,
      failed_at = CASE WHEN ${input.kind} = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      bounced_at = CASE WHEN ${input.kind} = 'bounced' THEN CURRENT_TIMESTAMP ELSE NULL END,
      next_attempt_at = CASE
        WHEN ${input.kind} = 'reconciliation' THEN CURRENT_TIMESTAMP + INTERVAL '10 minutes'
        ELSE NULL END,
      claimed_at = NULL,
      failure_ciphertext = CASE WHEN ${input.kind} = 'failed' THEN ${failureCiphertext} ELSE NULL END
    WHERE id = ${input.intentId} AND state = 'pending'`)
  if (!rowCount) throw new Error(`Copyright delivery ${input.intentId} could not be marked`)
}

export async function confirmCopyrightStaffAlertReview(input: {
  restrictionId: string
  actorUserId: string
}): Promise<void> {
  const { rowCount } = await write(sql`/* confirmCopyrightStaffAlertReview */
    UPDATE copyright_restrictions
    SET human_reviewed_at = CURRENT_TIMESTAMP, human_review_action = 'confirm',
      human_reviewed_by_id = ${input.actorUserId}
    WHERE id = ${input.restrictionId} AND human_reviewed_at IS NULL`)
  if (!rowCount) throw new Error(`Copyright restriction ${input.restrictionId} was not reviewed`)
}

export async function readCopyrightDeliveryObligation(intentId: string): Promise<{
  state: string
  failed_at: Date | null
}> {
  const { rows } = await read<{ state: string; failed_at: Date | null }>(
    sql`/* readCopyrightDeliveryObligation */
      SELECT state, failed_at FROM copyright_notice_delivery_intents WHERE id = ${intentId}`,
  )
  const row = rows[0]
  if (!row) throw new Error(`Copyright delivery ${intentId} is missing`)
  return row
}

export async function readCopyrightDeadlineObligation(deadlineId: string): Promise<{
  resolved_at: Date | null
  cancelled_at: Date | null
}> {
  const { rows } = await read<{ resolved_at: Date | null; cancelled_at: Date | null }>(
    sql`/* readCopyrightDeadlineObligation */
      SELECT resolved_at, cancelled_at FROM copyright_notice_deadlines WHERE id = ${deadlineId}`,
  )
  const row = rows[0]
  if (!row) throw new Error(`Copyright deadline ${deadlineId} is missing`)
  return row
}
