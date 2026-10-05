import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from './copyright-surface-target-fixtures.mts'
import { dsaTestPayload } from './dsa-transparency-database-fixtures.mts'

export type TestDsaSubmission = {
  id: string
  lease_token: string | null
  submitted_at: Date | null
  transparency_database_uuid: string | null
  available_at: Date
}

export async function seedTestDsaSubmission(restrictionId: string): Promise<string> {
  const payload = { ...dsaTestPayload(), puid: restrictionId }
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO copyright_dsa_statement_submissions (copyright_restriction_id, payload)
    VALUES (${restrictionId}, ${JSON.stringify(payload)}::jsonb)
    RETURNING id
  `)
  if (!rows[0]) throw new Error('Could not seed DSA submission')
  return rows[0].id
}

export async function createTestDsaSubmission(): Promise<string> {
  const image = await createTestCopyrightImageFixture('post-image')
  const restriction = await createTestCopyrightRestrictionForImage(image)
  return seedTestDsaSubmission(restriction.restrictionId)
}

export async function readTestDsaSubmission(id: string): Promise<TestDsaSubmission> {
  const { rows } = await read<TestDsaSubmission>(sql`
    SELECT id, lease_token::text, submitted_at, transparency_database_uuid::text, available_at
    FROM copyright_dsa_statement_submissions WHERE id = ${id}
  `)
  if (!rows[0]) throw new Error('Test DSA submission missing')
  return rows[0]
}

export async function readTestDsaAttempts(id: string): Promise<
  Array<{
    attempt_number: number
    outcome: string
    error_code: string | null
    replayed_by_id: string | null
  }>
> {
  const { rows } = await read<{
    attempt_number: number
    outcome: string
    error_code: string | null
    replayed_by_id: string | null
  }>(sql`
    SELECT attempt_number, outcome, error_code, replayed_by_id::text
    FROM copyright_dsa_statement_submission_attempts
    WHERE copyright_dsa_statement_submission_id = ${id}
    ORDER BY attempt_number
  `)
  return rows
}

export async function makeTestDsaSubmissionDue(id: string): Promise<void> {
  await write(sql`
    UPDATE copyright_dsa_statement_submissions
    SET available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
    WHERE id = ${id}
  `)
}

export async function expireTestDsaSubmissionLease(id: string): Promise<void> {
  await write(sql`
    UPDATE copyright_dsa_statement_submissions
    SET leased_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes',
      lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE id = ${id} AND lease_token IS NOT NULL
  `)
}

export async function seedTestDsaDeadLetter(id: string): Promise<void> {
  await write(sql`
    INSERT INTO copyright_dsa_statement_submission_attempts (
      copyright_dsa_statement_submission_id, attempt_number, outcome, error_code
    ) SELECT ${id}, series.attempt_number, 'retryable_failure', 'http_503'
      FROM generate_series(1, 5) AS series(attempt_number)
  `)
}

export async function seedTestDsaFailureRound(
  id: string,
  firstAttemptNumber: number,
  count = 5,
): Promise<void> {
  await write(sql`
    INSERT INTO copyright_dsa_statement_submission_attempts (
      copyright_dsa_statement_submission_id, attempt_number, outcome, error_code
    ) SELECT ${id}, ${firstAttemptNumber} + series.ordinal, 'retryable_failure', 'http_503'
      FROM generate_series(0, ${count - 1}) AS series(ordinal)
  `)
}

export async function countTestDsaSubmissionsForRestriction(
  restrictionId: string,
): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::integer AS count FROM copyright_dsa_statement_submissions
    WHERE copyright_restriction_id = ${restrictionId}
  `)
  return rows[0]?.count ?? 0
}

export async function liftTestCopyrightRestriction(restrictionId: string): Promise<void> {
  await write(sql`
    UPDATE copyright_restrictions
    SET lifted_at = CURRENT_TIMESTAMP
    WHERE id = ${restrictionId} AND lifted_at IS NULL
  `)
}

export async function seedTestDsaSubmitted(id: string, responseUuid: string): Promise<void> {
  await write(sql`
    UPDATE copyright_dsa_statement_submissions
    SET submitted_at = CURRENT_TIMESTAMP, transparency_database_uuid = ${responseUuid}
    WHERE id = ${id}
  `)
  await write(sql`
    INSERT INTO copyright_dsa_statement_submission_attempts (
      copyright_dsa_statement_submission_id, attempt_number, outcome, status_code
    ) VALUES (${id}, 1, 'submitted', 201)
  `)
}
