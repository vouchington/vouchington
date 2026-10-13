import { read } from '@data-stores/psql'
import {
  assertDsaStatementPayload,
  buildCopyrightDsaStatementPayload,
} from '../services/copyright-notices/dsa-statement-payload.mts'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

/**
 * Exercises the real builder's missing-restriction assertion or the real payload validator,
 * without changing immutable evidence or completed images. Other restrictions build normally.
 */
export function createTestDsaPayloadBuildFailure(
  restrictionId: string,
  status: 404 | 422,
): typeof buildCopyrightDsaStatementPayload {
  const missingRestrictionId = v7()
  return async (currentRestrictionId, transaction) => {
    if (currentRestrictionId === restrictionId && status === 404)
      return buildCopyrightDsaStatementPayload(missingRestrictionId, transaction)
    const payload = await buildCopyrightDsaStatementPayload(currentRestrictionId, transaction)
    if (currentRestrictionId === restrictionId && status === 422)
      assertDsaStatementPayload({ ...payload, content_date: '1999-12-31' })
    return payload
  }
}

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
  const { rows } = await read<TestDsaSubmissionForRestriction>(sql`
    SELECT id, payload, failed_at, failure_code, submitted_at, available_at
    FROM copyright_dsa_statement_submissions
    WHERE copyright_restriction_id = ${restrictionId}
  `)
  if (!rows[0]) throw new Error('Test DSA submission missing for restriction')
  return rows[0]
}
