import sql from 'sql-template-strings'
import { copyrightRetentionBlockerPhase } from './retention-minimal-blocker-phase.mts'

/** Open legal proceedings and reporting obligations are independent of ordinary staff work. */
export const COPYRIGHT_MINIMAL_BLOCKER_PHASES_DSA = [
  copyrightRetentionBlockerPhase(
    'copyright_territorial_decisions',
    (noticeId, now, complaintMonths) => sql`
    SELECT decision.id,
      (decision.decided_at AT TIME ZONE 'UTC' + make_interval(months => ${complaintMonths})) AT TIME ZONE 'UTC' > ${now}
      OR (decision.jurisdiction = 'eu_dsa' AND NOT EXISTS (
        SELECT 1 FROM copyright_eu_transparency_reports report WHERE report.period_started_at <= decision.decided_at
          AND report.period_ended_at > decision.decided_at AND report.source_generation >= decision.transparency_generation)) AS blocked
    FROM copyright_territorial_decisions decision WHERE decision.copyright_notice_id = ${noticeId}`,
  ),
  copyrightRetentionBlockerPhase(
    'copyright_territorial_escalations',
    noticeId => sql`
    SELECT escalation.id, NOT EXISTS (SELECT 1 FROM copyright_territorial_escalation_closures closure
      WHERE closure.copyright_territorial_escalation_id = escalation.id)
      OR (escalation.jurisdiction = 'eu_dsa' AND NOT EXISTS (
        SELECT 1 FROM copyright_eu_transparency_reports report WHERE report.period_started_at <= escalation.escalated_at
          AND report.period_ended_at > escalation.escalated_at AND report.source_generation >= escalation.transparency_generation)) AS blocked
    FROM copyright_territorial_escalations escalation WHERE escalation.copyright_notice_id = ${noticeId}`,
  ),
  copyrightRetentionBlockerPhase(
    'copyright_eu_supervised_complaints',
    noticeId => sql`
    SELECT complaint.id, NOT EXISTS (SELECT 1 FROM copyright_eu_supervised_complaint_resolutions resolution
      WHERE resolution.copyright_eu_supervised_complaint_id = complaint.id)
      OR NOT EXISTS (SELECT 1 FROM copyright_eu_transparency_reports report
        WHERE report.period_started_at <= complaint.received_at AND report.period_ended_at > complaint.received_at AND report.source_generation >= complaint.transparency_generation) AS blocked
    FROM copyright_eu_supervised_complaints complaint WHERE complaint.copyright_notice_id = ${noticeId}`,
  ),
  copyrightRetentionBlockerPhase(
    'copyright_eu_dispute_settlement_referrals',
    noticeId => sql`
    SELECT referral.id, NOT EXISTS (SELECT 1 FROM copyright_eu_dispute_settlement_outcomes outcome
      WHERE outcome.copyright_eu_dispute_settlement_referral_id = referral.id
        AND (outcome.result <> 'decided_for_recipient' OR outcome.implemented_at IS NOT NULL)) AS blocked
    FROM copyright_eu_dispute_settlement_referrals referral WHERE referral.copyright_notice_id = ${noticeId}`,
  ),
  copyrightRetentionBlockerPhase(
    'copyright_case_preservation_holds',
    noticeId => sql`
    SELECT hold.id, hold.released_at IS NULL AS blocked FROM copyright_case_preservation_holds hold
    WHERE hold.copyright_notice_id = ${noticeId}`,
  ),
  copyrightRetentionBlockerPhase(
    'copyright_territorial_notice_receipts',
    noticeId => sql`
    SELECT receipt.id, receipt.jurisdiction = 'eu_dsa' AND NOT EXISTS (
      SELECT 1 FROM copyright_eu_transparency_reports report WHERE report.period_started_at <= receipt.received_at
        AND report.period_ended_at > receipt.received_at AND report.source_generation >= receipt.transparency_generation) AS blocked
    FROM copyright_territorial_notice_receipts receipt WHERE receipt.copyright_notice_id = ${noticeId}`,
  ),
  copyrightRetentionBlockerPhase(
    'copyright_territorial_redress_requests',
    noticeId => sql`
    SELECT request.id, request.jurisdiction = 'eu_dsa' AND (
      NOT EXISTS (SELECT 1 FROM copyright_eu_transparency_reports report WHERE report.period_started_at <= request.received_at
        AND report.period_ended_at > request.received_at AND report.source_generation >= request.transparency_generation)
      OR EXISTS (SELECT 1 FROM copyright_territorial_redress_decisions decision
        WHERE decision.copyright_territorial_redress_request_id = request.id AND NOT EXISTS (
          SELECT 1 FROM copyright_eu_transparency_reports report WHERE report.period_started_at <= decision.decided_at
            AND report.period_ended_at > decision.decided_at AND report.source_generation >= decision.transparency_generation))) AS blocked
    FROM copyright_territorial_redress_requests request WHERE request.copyright_notice_id = ${noticeId}`,
  ),
  copyrightRetentionBlockerPhase(
    'copyright_dsa_statement_submissions',
    noticeId => sql`
    SELECT submission.id,
      submission.lease_token IS NOT NULL OR (submission.submitted_at IS NULL AND submission.failed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM copyright_dsa_statement_submission_attempts attempt
          WHERE attempt.copyright_dsa_statement_submission_id = submission.id AND attempt.outcome = 'permanent_failure'
            AND attempt.attempt_number > COALESCE((SELECT replay.attempt_number
              FROM copyright_dsa_statement_submission_attempts replay WHERE replay.copyright_dsa_statement_submission_id = submission.id
                AND replay.outcome = 'replayed' ORDER BY replay.attempt_number DESC LIMIT 1), 0))
        AND (SELECT count(*) FROM (SELECT attempt.outcome FROM copyright_dsa_statement_submission_attempts attempt
          WHERE attempt.copyright_dsa_statement_submission_id = submission.id
            AND attempt.attempt_number > COALESCE((SELECT replay.attempt_number
              FROM copyright_dsa_statement_submission_attempts replay WHERE replay.copyright_dsa_statement_submission_id = submission.id
                AND replay.outcome = 'replayed' ORDER BY replay.attempt_number DESC LIMIT 1), 0)
          ORDER BY attempt.attempt_number DESC LIMIT 5) round WHERE round.outcome = 'retryable_failure') < 5) AS blocked
    FROM copyright_dsa_statement_submissions submission JOIN copyright_restrictions restriction
      ON restriction.id = submission.copyright_restriction_id WHERE restriction.copyright_notice_id = ${noticeId}`,
  ),
]
