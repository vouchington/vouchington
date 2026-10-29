import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Current authority after detailed history retired; no history row or test DDL is created. */
export async function createTestRetiredCopyrightAssessment(input: {
  submissionId: string
  screeningId: string
}): Promise<{ id: string }> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(sql`/* createTestRetiredCopyrightAssessment */
    INSERT INTO copyright_notice_submission_assessment_identities
      (copyright_notice_id, copyright_notice_submission_id)
    SELECT copyright_notice_id, id FROM copyright_notice_submissions
    WHERE id = ${input.submissionId} RETURNING id`)
  const identity = rows[0]
  if (!identity) throw new Error('Copyright assessment submission missing')
  await query(sql`/* createTestRetiredCopyrightAssessment:current */
    UPDATE copyright_notice_submissions SET current_assessment_identity_id = ${identity.id},
      current_assessment_is_substantially_compliant = true, current_assessed_at = CURRENT_TIMESTAMP,
      current_assessed_by_id = NULL, current_assessment_form_screening_id = ${input.screeningId}
    WHERE id = ${input.submissionId}`)
  await query.commit()
  return identity
}
