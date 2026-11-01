import sql from 'sql-template-strings'

/** Owner-approved six UTC calendar years from the latest legal activity. */
export const COPYRIGHT_CASE_RETENTION_MONTHS = 72
export const COPYRIGHT_CASE_COMPLAINT_MONTHS = 6

/** Indexed root and active case-hold proof, repeated under the notice lock on every page. */
export function copyrightCasePurgeEligibilitySql(noticeId: string) {
  return sql`/* readCopyrightCasePurgeEligibility */
    SELECT notice.id, notice.jurisdiction, notice.last_legal_activity_at,
      notice.evidence_erased_at
    FROM copyright_notices notice
    WHERE notice.id = ${noticeId}::uuid
      AND notice.jurisdiction IN ('us_dmca', 'eu_dsa', 'uk')
      AND notice.last_legal_activity_at <=
        ((clock_timestamp() AT TIME ZONE 'UTC')
          - make_interval(months => ${COPYRIGHT_CASE_RETENTION_MONTHS})) AT TIME ZONE 'UTC'
      AND notice.received_at <=
        ((clock_timestamp() AT TIME ZONE 'UTC')
          - make_interval(months => ${COPYRIGHT_CASE_RETENTION_MONTHS})) AT TIME ZONE 'UTC'
      AND (notice.last_guest_capability_activity_at IS NULL OR
        notice.last_guest_capability_activity_at <=
          ((clock_timestamp() AT TIME ZONE 'UTC')
            - make_interval(months => ${COPYRIGHT_CASE_RETENTION_MONTHS})) AT TIME ZONE 'UTC')
      AND (notice.jurisdiction = 'us_dmca' OR notice.territorial_decision_outcome IS NOT NULL
        OR notice.evidence_erased_at IS NOT NULL)
      AND (notice.territorial_decided_at IS NULL OR
        ((notice.territorial_decided_at AT TIME ZONE 'UTC')
          + make_interval(months => ${COPYRIGHT_CASE_COMPLAINT_MONTHS})
          + make_interval(months => ${COPYRIGHT_CASE_RETENTION_MONTHS})) AT TIME ZONE 'UTC'
            <= clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM copyright_case_preservation_holds hold
        WHERE hold.copyright_notice_id = notice.id AND hold.released_at IS NULL)
      AND (notice.evidence_erased_at IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM copyright_notice_submissions initial
        WHERE initial.copyright_notice_id = notice.id
          AND initial.kind = 'notice' AND initial.source_kind <> 'staff'
          AND initial.current_assessment_identity_id IS NULL))
      AND (notice.evidence_erased_at IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM copyright_notice_form_intakes intake
        JOIN copyright_notice_submissions submission
          ON submission.id = intake.copyright_notice_submission_id
        WHERE intake.copyright_notice_id = notice.id
          AND (submission.source_kind = 'guest_form'
            OR submission.current_assessment_is_substantially_compliant IS DISTINCT FROM true)
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_intake_reviews review
            WHERE review.copyright_notice_form_intake_id = intake.id)))
  `
}
