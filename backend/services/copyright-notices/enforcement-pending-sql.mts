import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Builds `SELECT <select> FROM ... WHERE ...` over every unrestricted target a notice assessment
 * still owes. Callers append their own filter, ordering and limit.
 *
 * An assessment owes its notice's targets when it is a current, compliant notice assessment whose
 * screening is current and whose form has no rejected review. A target is owed until it has any
 * restriction, active or lifted, so a lifted target is never re-restricted by an assessment that
 * already did its work. An automated assessment owes nothing while `automaticWithholding` is false;
 * pass `true` to see the assessments the switch is holding back.
 */
export function pendingCopyrightEnforcementSql(
  select: string,
  automaticWithholding: boolean,
): SQLStatement {
  return sql``
    .append(`SELECT ${select}
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    JOIN copyright_notice_targets target
      ON target.copyright_notice_id = submission.copyright_notice_id
    WHERE submission.kind = 'notice'
      AND assessment.substantially_compliant
      AND (assessment.copyright_notice_form_screening_id IS NULL OR
        fn_current_copyright_form_screening(submission.id, assessment.copyright_notice_form_screening_id))
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_form_intakes intake
        JOIN copyright_notice_form_intake_reviews review
          ON review.copyright_notice_form_intake_id = intake.id
        WHERE intake.copyright_notice_submission_id = assessment.copyright_notice_submission_id
          AND NOT review.accepted
      )
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_target_id = target.id
      )
      AND (`)
    .append(
      sql`${automaticWithholding}::boolean OR NOT (
        assessment.assessed_by_id IS NULL AND assessment.copyright_notice_form_screening_id IS NOT NULL
      ))`,
    )
}
