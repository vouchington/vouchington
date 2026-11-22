import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  completeCopyrightFormScreening,
  type CopyrightFormScreeningAttempt,
} from '../services/copyright-notices/form-screening-executions.mts'

type CopyrightFormScreeningResultInput = Parameters<typeof completeCopyrightFormScreening>[1]

export async function appendTestCopyrightFormScreening(
  input: CopyrightFormScreeningResultInput,
): Promise<string> {
  const attempt = await prepareTestCopyrightScreeningCompletion(input.intakeId)
  const result = await completeCopyrightFormScreening(attempt, input)
  if (!result) throw new Error('Copyright screening attempt was superseded')
  return result
}

/** Result fixtures own the entire intake and do not exercise competing claim admission. */
async function prepareTestCopyrightScreeningCompletion(
  intakeId: string,
): Promise<CopyrightFormScreeningAttempt> {
  await using transaction = await beginTransaction()
  const { rows: attempts } = await transaction<{
    id: string
    attempt_number: number
    state: string
    execution_started_at: Date | null
  }>(sql`/* prepareTestCopyrightScreeningCompletion:current */
    SELECT id, attempt_number, state, execution_started_at
    FROM copyright_notice_form_screening_attempts
    WHERE copyright_notice_form_intake_id = ${intakeId}
    ORDER BY attempt_number DESC LIMIT 1
  `)
  const current = attempts[0]
  if (
    !current ||
    current.state === 'completed' ||
    (current.state === 'pending' && current.execution_started_at)
  ) {
    throw new Error('Expected a failed or unclaimed fixture screening attempt')
  }
  const result =
    current.state === 'failed'
      ? await transaction<{ attempt_number: number; execution_token: string }>(sql`
        /* prepareTestCopyrightScreeningCompletion:replacement */
        INSERT INTO copyright_notice_form_screening_attempts (
          copyright_notice_form_intake_id, attempt_number, started_at, execution_started_at
        ) VALUES (${intakeId}, ${current.attempt_number + 1}, statement_timestamp(), statement_timestamp())
        RETURNING attempt_number, execution_token
      `)
      : await transaction<{ attempt_number: number; execution_token: string }>(sql`
        /* prepareTestCopyrightScreeningCompletion:start */
        UPDATE copyright_notice_form_screening_attempts
        SET execution_started_at = clock_timestamp()
        WHERE id = ${current.id}
        RETURNING attempt_number, execution_token
      `)
  const attempt = result.rows[0]
  if (!attempt) throw new Error('Fixture screening attempt was not prepared')
  await transaction.commit()
  return { intakeId, attemptNumber: attempt.attempt_number, leaseToken: attempt.execution_token }
}
