import sql, { type SQLStatement } from 'sql-template-strings'

/** Durable provenance, unaffected by ON DELETE SET NULL on moderator identities. */
export function automatedAssessmentSql(assessmentAlias = 'assessment'): SQLStatement {
  return sql``.append(
    `${checkedAlias(assessmentAlias)}.copyright_notice_form_screening_id IS NOT NULL`,
  )
}

export function automaticRestrictionSql(restrictionAlias = 'restriction'): SQLStatement {
  return sql``.append(`${checkedAlias(restrictionAlias)}.is_authorizing_assessment_automated`)
}

/** Guidance means an actual result exists, never merely a pending or failed execution. */
export function aiGuidanceSql(noticeAlias = 'notice'): SQLStatement {
  const notice = checkedAlias(noticeAlias)
  return sql``.append(`(EXISTS (SELECT 1 FROM copyright_notice_submissions guidance_submission
    JOIN copyright_notice_form_intakes guidance_intake ON guidance_intake.copyright_notice_submission_id = guidance_submission.id
    JOIN copyright_notice_form_screenings guidance_screening ON guidance_screening.copyright_notice_form_intake_id = guidance_intake.id
    WHERE guidance_submission.copyright_notice_id = ${notice}.id)
    OR EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links guidance_link
      JOIN copyright_notice_email_intakes guidance_intake
        ON guidance_intake.id = guidance_link.copyright_notice_email_intake_receipt_id
      WHERE guidance_link.copyright_notice_id = ${notice}.id
        AND guidance_link.link_kind = 'initial'
        AND guidance_intake.recommendation_completed_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM copyright_notice_submissions guidance_appeal
      JOIN copyright_notice_appeal_recommendations guidance_recommendation ON guidance_recommendation.copyright_notice_submission_id = guidance_appeal.id
      WHERE guidance_appeal.copyright_notice_id = ${notice}.id)
    OR EXISTS (SELECT 1 FROM copyright_notice_submissions guidance_submission
      JOIN copyright_notice_submission_guidance guidance_result
        ON guidance_result.copyright_notice_submission_id = guidance_submission.id
      WHERE guidance_submission.copyright_notice_id = ${notice}.id))`)
}

function checkedAlias(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error('Invalid copyright SQL alias')
  return alias
}
