import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestDsaSubmissionForRestriction = {
  id: string
  payload: { puid: string } | null
  failed_at: Date | null
  failure_code: string | null
  submitted_at: Date | null
  available_at: Date
}

export async function readTestDsaSubmissionForRestriction(
  restrictionId: string,
): Promise<TestDsaSubmissionForRestriction> {
  const { rows } = await read<TestDsaSubmissionForRestriction>(
    sql`/* readTestDsaSubmissionForRestriction */
    SELECT id, payload, failed_at, failure_code, submitted_at, available_at
    FROM copyright_dsa_statement_submissions
    WHERE copyright_restriction_id = ${restrictionId}
  `,
  )
  if (!rows[0]) throw new Error('Test DSA submission missing for restriction')
  return rows[0]
}
