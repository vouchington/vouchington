import sql from 'sql-template-strings'
import type { CopyrightMinimalBlockerPhase } from './retention-minimal-blocker-phase-types.mts'

export const COPYRIGHT_MINIMAL_BLOCKER_PHASES_2: readonly CopyrightMinimalBlockerPhase[] = [
  {
    table: 'copyright_notice_delivery_work_items',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalReceiptBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT receipt.id FROM copyright_notice_delivery_work_items receipt
        WHERE receipt.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR receipt.id > ${cursor}::uuid)
        ORDER BY receipt.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT receipt.id,
          receipt.recipient_role = 'claimant' AND receipt.channel = 'email'
            AND receipt.delivery_kind = 'claimant_receipt'
            AND EXISTS (SELECT 1 FROM copyright_notice_delivery_recipients recipient
              WHERE recipient.copyright_notice_delivery_work_item_id = receipt.id)
            AS claimant_receipt
        FROM selected JOIN copyright_notice_delivery_work_items receipt ON receipt.id = selected.id
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        false AS blocked, false AS valid_target, false AS unrestricted_target,
        COALESCE((SELECT bool_or(claimant_receipt) FROM facts), false) AS claimant_receipt,
        false AS notice_assessment, false AS form_assessment`,
  },
  {
    table: 'copyright_notice_submission_assessments',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalAssessmentBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT assessment.id FROM copyright_notice_submission_assessments assessment
        WHERE assessment.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR assessment.id > ${cursor}::uuid)
        ORDER BY assessment.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT assessment.id, assessment.is_substantially_compliant,
          submission.kind, submission.source_kind,
          assessment.copyright_notice_form_screening_id IS NULL AS without_screening,
          NOT EXISTS (SELECT 1 FROM copyright_notice_submission_assessments newer
            WHERE newer.supersedes_assessment_id = assessment.id) AS is_current,
          NOT EXISTS (SELECT 1 FROM copyright_notice_form_intakes intake_reviewed
            JOIN copyright_notice_form_intake_reviews review
              ON review.copyright_notice_form_intake_id = intake_reviewed.id
            WHERE intake_reviewed.copyright_notice_submission_id = submission.id
              AND NOT review.is_accepted) AS not_rejected,
          NOT EXISTS (SELECT 1 FROM copyright_territorial_redress_decisions redress
            WHERE redress.revoked_assessment_id = assessment.id) AS not_revoked,
          assessment.copyright_notice_form_screening_id IS NOT NULL
            AND latest_attempt.state = 'completed'
            AND latest_attempt.copyright_notice_form_screening_id = assessment.copyright_notice_form_screening_id
            AND screening.recommendation = 'not_obviously_invalid'
            AND submission.source_kind = 'signed_in_form'
            AND intake.requester_user_id IS NOT NULL
            AND notice.jurisdiction = 'us_dmca'
            AND char_length(notice.claimant_contact_ciphertext) > 0
            AND char_length(btrim(notice.work_description)) > 0
            AND intake.has_good_faith_belief
            AND intake.has_accuracy_authority_under_penalty_of_perjury
            AND char_length(intake.electronic_signature_ciphertext) > 0
            AND work.valid_target_found AND work.claimant_receipt_found
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_intake_reviews review
              WHERE review.copyright_notice_form_intake_id = intake.id AND NOT review.is_accepted)
            AS current_form_screening
        FROM selected JOIN copyright_notice_submission_assessments assessment
          ON assessment.id = selected.id
        JOIN copyright_notice_submissions submission
          ON submission.id = assessment.copyright_notice_submission_id
        JOIN copyright_notices notice ON notice.id = ${noticeId}
        JOIN copyright_notice_minimal_purge_work work ON work.copyright_notice_id = ${noticeId}
        LEFT JOIN copyright_notice_form_intakes intake
          ON intake.copyright_notice_submission_id = submission.id
        LEFT JOIN LATERAL (
          SELECT attempt.state, attempt.copyright_notice_form_screening_id
          FROM copyright_notice_form_screening_attempts attempt
          WHERE attempt.copyright_notice_form_intake_id = intake.id
          ORDER BY attempt.attempt_number DESC LIMIT 1
        ) latest_attempt ON true
        LEFT JOIN copyright_notice_form_screenings screening
          ON screening.id = assessment.copyright_notice_form_screening_id
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        false AS blocked, false AS valid_target, false AS unrestricted_target,
        false AS claimant_receipt,
        COALESCE((SELECT bool_or(kind = 'notice' AND is_substantially_compliant
          AND is_current AND not_rejected AND not_revoked
          AND (without_screening OR current_form_screening)) FROM facts), false)
          AS notice_assessment,
        COALESCE((SELECT bool_or(kind = 'notice' AND is_substantially_compliant
          AND is_current AND current_form_screening) FROM facts), false)
          AS form_assessment`,
  },
]
