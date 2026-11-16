import sql from 'sql-template-strings'

/** An exact assessed filing can end its restriction; other case/target holds remain separate. */
export function courtFilingReleaseSourceSql() {
  return sql`EXISTS (
    SELECT 1 FROM copyright_notice_legal_hold_assessments filing_assessment
    WHERE filing_assessment.copyright_notice_submission_id = restriction.copyright_notice_submission_id
      AND (
        NOT (filing_assessment.is_from_original_claimant AND filing_assessment.is_same_material
          AND filing_assessment.proceeding_kind IS NOT NULL AND filing_assessment.commenced_at IS NOT NULL
          AND filing_assessment.received_by_designated_agent_at IS NOT NULL
          AND filing_assessment.received_by_designated_agent_at <= filing_assessment.assessed_at)
        OR NOT EXISTS (
          SELECT 1 FROM copyright_notice_legal_hold_assessment_targets scope
          WHERE scope.copyright_notice_legal_hold_assessment_id = filing_assessment.id
            AND scope.copyright_notice_target_id = restriction.copyright_notice_target_id
        )
        OR EXISTS (
          SELECT 1 FROM copyright_notice_legal_hold_resolutions resolution
          WHERE resolution.copyright_notice_legal_hold_assessment_id = filing_assessment.id
        )
      )
  )`
}
