import { selectStaffRestrictions } from '../services/copyright-notices/read-models-staff-restrictions.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Probe a real canonical restriction insert; successful probes also roll back. */
export async function insertTestCopyrightFilingSource(input: {
  targetId: string
  submissionId: string | null
  assessmentId: string | null
  automated?: boolean
}): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* insertTestCopyrightFilingSource */
    INSERT INTO copyright_restrictions (
      copyright_notice_target_id, authorizing_assessment_id, copyright_notice_submission_id,
      is_authorizing_assessment_automated, imposed_at, lifted_at
    ) VALUES (${input.targetId}, ${input.assessmentId}, ${input.submissionId},
      ${input.automated ?? false}, clock_timestamp(), clock_timestamp())
  `)
}

/** Attempt an immutable source replacement without retaining any probe mutation. */
export async function changeTestCopyrightFilingSource(
  restrictionId: string,
  submissionId: string,
): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* changeTestCopyrightFilingSource */
    UPDATE copyright_restrictions SET copyright_notice_submission_id = ${submissionId}
    WHERE id = ${restrictionId}
  `)
}

export async function readTestCopyrightFilingHoldBindings(restrictionId: string) {
  await using query = await beginTransaction()
  const { rows } = await query<{ copyright_notice_legal_hold_assessment_id: string }>(sql`
    /* readTestCopyrightFilingHoldBindings */
    SELECT copyright_notice_legal_hold_assessment_id FROM copyright_legal_hold_restrictions
    WHERE copyright_restriction_id = ${restrictionId}
    ORDER BY copyright_notice_legal_hold_assessment_id
  `)
  return rows.map(row => row.copyright_notice_legal_hold_assessment_id)
}

/** Read the production staff restriction DTO for one owned case without unrelated intake joins. */
export async function readTestStaffFilingRestrictions(noticeId: string) {
  await using query = await beginTransaction()
  return (await selectStaffRestrictions([noticeId], query)).get(noticeId) ?? []
}
