import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  advanceCopyrightThreadBlockerPhase,
  type BlockerCursor,
} from './operational-retention-thread-blockers-state.mts'

export async function readCopyrightThreadScreeningPage(
  transaction: TransactionQuery,
  noticeId: string,
  batchSize: number,
  cursor: BlockerCursor,
): Promise<BlockerCursor & { blocked: boolean }> {
  switch (cursor.phase) {
    case 'form_intake': {
      const { rows } = await transaction<{
        id: string
        source_kind: string
        reviewed: boolean
      }>(sql`
        /* scanCopyrightThreadFormIntakeBlocker */
        SELECT intake.id, submission.source_kind,
          review.id IS NOT NULL AS reviewed
        FROM copyright_notice_form_intakes intake
        JOIN copyright_notice_submissions submission
          ON submission.id = intake.copyright_notice_submission_id
        LEFT JOIN copyright_notice_form_intake_reviews review
          ON review.copyright_notice_form_intake_id = intake.id
        WHERE intake.copyright_notice_id = ${noticeId} LIMIT 1`)
      const intake = rows[0]
      if (!intake || intake.reviewed)
        return advanceCopyrightThreadBlockerPhase(cursor, 'territorial_receipts')
      if (intake.source_kind === 'guest_form') return { ...cursor, blocked: true }
      return { ...cursor, phase: 'form_assessments', childId: null, blocked: false }
    }
    case 'form_assessments': {
      const { rows } = await transaction<{ id: string; qualifies: boolean | null }>(sql`
        /* scanCopyrightThreadFormAssessmentBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        intake_source AS MATERIALIZED (
          SELECT copyright_notice_submission_id FROM copyright_notice_form_intakes
          WHERE copyright_notice_id = (SELECT notice_id FROM owner)
        ),
        page AS MATERIALIZED (
          SELECT submission.current_assessment_identity_id AS id,
            submission.id AS copyright_notice_submission_id,
            submission.current_assessment_form_screening_id AS copyright_notice_form_screening_id,
            submission.current_assessment_is_substantially_compliant AS is_substantially_compliant
          FROM intake_source
          JOIN copyright_notice_submissions submission
            ON submission.id = intake_source.copyright_notice_submission_id
          WHERE submission.current_assessment_identity_id > COALESCE(${cursor.childId}::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY submission.current_assessment_identity_id LIMIT ${batchSize}
        )
        SELECT page.id, (page.is_substantially_compliant
          AND execution.state = 'completed'
          AND page.copyright_notice_form_screening_id = execution.copyright_notice_form_screening_id
          AND screening.recommendation = 'not_obviously_invalid'
          AND submission.kind = 'notice' AND submission.source_kind = 'signed_in_form'
          AND intake.requester_user_id IS NOT NULL
          AND notice.jurisdiction = 'us_dmca'
          AND char_length(notice.claimant_contact_ciphertext) > 0
          AND char_length(btrim(notice.work_description)) > 0
          AND intake.has_good_faith_belief
          AND intake.has_accuracy_authority_under_penalty_of_perjury
          AND char_length(intake.electronic_signature_ciphertext) > 0) AS qualifies
        FROM page
        JOIN copyright_notice_submissions submission
          ON submission.id = page.copyright_notice_submission_id
        JOIN copyright_notice_form_intakes intake
          ON intake.copyright_notice_submission_id = submission.id
        JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
        LEFT JOIN LATERAL (
          SELECT attempt.copyright_notice_form_screening_id, attempt.state
          FROM copyright_notice_form_screening_attempts attempt
          WHERE attempt.copyright_notice_form_intake_id = intake.id
          ORDER BY attempt.attempt_number DESC LIMIT 1
        ) execution ON true
        LEFT JOIN copyright_notice_form_screenings screening
          ON screening.id = execution.copyright_notice_form_screening_id`)
      if (rows.some(row => row.qualifies)) {
        return {
          ...cursor,
          phase: 'form_screening_targets',
          childId: null,
          blocked: false,
        }
      }
      if (rows.length < batchSize) return { ...cursor, blocked: true }
      return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
    }
    case 'form_screening_targets': {
      const { rows } = await transaction<{ id: string; qualifies: boolean }>(sql`
        /* scanCopyrightThreadScreeningTargetProof */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, hosted_use_url FROM copyright_notice_targets
          WHERE copyright_notice_id = (SELECT notice_id FROM owner)
            AND id > COALESCE(${cursor.childId}::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, (char_length(btrim(page.hosted_use_url)) > 0 AND EXISTS (
          SELECT 1 FROM copyright_notice_target_images image
          WHERE image.copyright_notice_target_id = page.id LIMIT 1
        )) AS qualifies FROM page`)
      if (rows.some(row => row.qualifies)) {
        return {
          ...cursor,
          phase: 'form_screening_receipts',
          childId: null,
          blocked: false,
        }
      }
      if (rows.length < batchSize) return { ...cursor, blocked: true }
      return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
    }
    case 'form_screening_receipts': {
      const { rows } = await transaction<{ id: string; qualifies: boolean }>(sql`
        /* scanCopyrightThreadScreeningReceiptProof */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, recipient_role, channel, delivery_kind
          FROM copyright_notice_delivery_work_items
          WHERE copyright_notice_id = (SELECT notice_id FROM owner)
            AND id > COALESCE(${cursor.childId}::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, (page.recipient_role = 'claimant' AND page.channel = 'email'
          AND page.delivery_kind = 'claimant_receipt' AND EXISTS (
            SELECT 1 FROM copyright_notice_delivery_recipients recipient
            WHERE recipient.copyright_notice_delivery_work_item_id = page.id LIMIT 1
          )) AS qualifies FROM page`)
      if (rows.some(row => row.qualifies)) {
        return {
          ...advanceCopyrightThreadBlockerPhase(cursor, 'territorial_receipts'),
        }
      }
      if (rows.length < batchSize) return { ...cursor, blocked: true }
      return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
    }
    default:
      throw new Error(`Unexpected copyright screening blocker phase: ${cursor.phase}`)
  }
}
