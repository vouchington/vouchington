import sql from 'sql-template-strings'
import type { CopyrightMinimalBlockerPhase } from './retention-minimal-blocker-phase-types.mts'

export const COPYRIGHT_MINIMAL_BLOCKER_PHASES_3: readonly CopyrightMinimalBlockerPhase[] = [
  {
    table: 'copyright_notice_legal_hold_assessments',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalCourtHoldBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT assessment.id FROM copyright_notice_legal_hold_assessments assessment
        WHERE assessment.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR assessment.id > ${cursor}::uuid)
        ORDER BY assessment.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT assessment.id,
          submission.kind = 'court_or_ccb_hold'
            AND assessment.is_from_original_claimant AND assessment.is_same_material
            AND assessment.proceeding_kind IS NOT NULL
            AND assessment.commenced_at IS NOT NULL
            AND assessment.received_by_designated_agent_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_resolutions resolution
              WHERE resolution.copyright_notice_legal_hold_assessment_id = assessment.id)
            AS blocked
        FROM selected JOIN copyright_notice_legal_hold_assessments assessment
          ON assessment.id = selected.id
        JOIN copyright_notice_submissions submission
          ON submission.id = assessment.copyright_notice_submission_id
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        COALESCE((SELECT bool_or(blocked) FROM facts), false) AS blocked,
        false AS valid_target, false AS unrestricted_target,
        false AS claimant_receipt, false AS notice_assessment, false AS form_assessment`,
  },
  {
    table: 'copyright_territorial_redress_requests',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalRedressBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT request.id FROM copyright_territorial_redress_requests request
        WHERE request.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR request.id > ${cursor}::uuid)
        ORDER BY request.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT request.id,
          NOT EXISTS (SELECT 1 FROM copyright_territorial_decisions successor
            WHERE successor.supersedes_decision_id = decision.id) AS decision_is_current,
          decision.outcome,
          redress.staff_disposition,
          redress.id IS NULL AS no_redress_decision
        FROM selected JOIN copyright_territorial_redress_requests request
          ON request.id = selected.id
        JOIN copyright_territorial_decisions decision
          ON decision.id = request.copyright_territorial_decision_id
        LEFT JOIN copyright_territorial_redress_decisions redress
          ON redress.copyright_territorial_redress_request_id = request.id
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        COALESCE((SELECT bool_or(decision_is_current
          AND (no_redress_decision OR (outcome = 'no_action' AND staff_disposition = 'revoke')))
          FROM facts), false) AS blocked,
        false AS valid_target, false AS unrestricted_target,
        false AS claimant_receipt, false AS notice_assessment, false AS form_assessment`,
  },
]
