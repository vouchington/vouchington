/** Static, row-scoped predicates evaluated only on an indexed, materialized child page. */
export const COPYRIGHT_CASE_CHILD_BLOCKERS: Readonly<Record<string, string>> = {
  copyright_notice_deadlines: 'child.resolved_at IS NULL AND child.cancelled_at IS NULL',
  copyright_restrictions: 'child.lifted_at IS NULL',
  copyright_repeat_infringer_incidents: 'child.is_operative',
  copyright_notice_delivery_work_items: "child.state IN ('pending', 'claimed')",
  copyright_notice_action_work_items: "child.state IN ('pending', 'claimed', 'failed')",
  copyright_notice_guest_capabilities: `child.revoked_at IS NULL AND child.expires_at >
    ((clock_timestamp() AT TIME ZONE 'UTC') - make_interval(months => 72)) AT TIME ZONE 'UTC'`,
  copyright_notice_legal_hold_assessments: `
    child.is_from_original_claimant AND child.is_same_material
    AND child.proceeding_kind IS NOT NULL AND child.commenced_at IS NOT NULL
    AND child.received_by_designated_agent_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_resolutions resolution
      WHERE resolution.copyright_notice_legal_hold_assessment_id = child.id)`,
  copyright_eu_supervised_complaints: 'child.resolved_at IS NULL',
  copyright_territorial_escalations: 'child.closed_at IS NULL',
  copyright_notice_form_intakes: `
    (SELECT submission.source_kind = 'guest_form'
      OR submission.current_assessment_is_substantially_compliant IS DISTINCT FROM true
     FROM copyright_notice_submissions submission
     WHERE submission.id = child.copyright_notice_submission_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_intake_reviews review
      WHERE review.copyright_notice_form_intake_id = child.id)
    AND EXISTS (SELECT 1 FROM copyright_notices notice
      WHERE notice.id = child.copyright_notice_id
        AND (notice.evidence_erased_at IS NULL
          OR uuid_extract_timestamp(child.id) > notice.evidence_erased_at))`,
  copyright_territorial_redress_requests: `child.staff_disposition IS NULL
    AND EXISTS (SELECT 1 FROM copyright_notices notice
      WHERE notice.id = child.copyright_notice_id
        AND (notice.evidence_erased_at IS NULL
          OR uuid_extract_timestamp(child.id) > notice.evidence_erased_at))`,
  copyright_eu_dispute_settlement_referrals: `
    NOT EXISTS (SELECT 1 FROM copyright_eu_dispute_settlement_outcomes outcome
      WHERE outcome.copyright_eu_dispute_settlement_referral_id = child.id)
    AND EXISTS (SELECT 1 FROM copyright_notices notice
      WHERE notice.id = child.copyright_notice_id
        AND (notice.evidence_erased_at IS NULL
          OR uuid_extract_timestamp(child.id) > notice.evidence_erased_at))`,
  copyright_notice_email_intake_notice_links: `child.link_kind = 'thread'
    AND child.correspondence_action IS NULL
    AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
      WHERE receipt.id = child.copyright_notice_email_intake_id
        AND receipt.review_decision IS NULL)
    AND EXISTS (SELECT 1 FROM copyright_notices notice
      WHERE notice.id = child.copyright_notice_id
        AND (notice.evidence_erased_at IS NULL
          OR uuid_extract_timestamp(child.id) > notice.evidence_erased_at))`,
  copyright_notice_submissions: `(
    (child.kind = 'notice' AND child.source_kind = 'staff'
      AND child.current_assessment_identity_id IS NULL)
    OR
    (child.kind = 'appeal' AND NOT EXISTS (
      SELECT 1 FROM copyright_notice_appeal_reviews review
      WHERE review.copyright_notice_submission_id = child.id))
    OR (child.kind = 'counter_notice' AND NOT EXISTS (
      SELECT 1 FROM copyright_notice_counter_notice_reviews review
      WHERE review.copyright_notice_submission_id = child.id))
    OR (child.kind = 'court_or_ccb_hold' AND (
      NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_assessments assessment
        WHERE assessment.copyright_notice_submission_id = child.id)
    ))
  ) AND EXISTS (SELECT 1 FROM copyright_notices notice
    WHERE notice.id = child.copyright_notice_id
      AND (child.kind = 'court_or_ccb_hold' OR notice.evidence_erased_at IS NULL
        OR uuid_extract_timestamp(child.id) > notice.evidence_erased_at))`,
}
