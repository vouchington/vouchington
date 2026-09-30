import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  type CopyrightFormGuidance,
  parseCopyrightFormGuidance,
} from './form-screening-guidance.mts'

type Transaction = Awaited<ReturnType<typeof beginTransaction>>
export type CopyrightFormScreeningAttempt = { intakeId: string; attemptNumber: number }
export type CopyrightFormScreeningResultInput = {
  intakeId: string
  inputSha256: Buffer
  recommendation: 'not_obviously_invalid' | 'invalid_or_spam'
  rationale: string
  guidance: CopyrightFormGuidance
  promptVersion: string
  model: string
}

export async function lockCopyrightFormReview(intakeId: string, query: Transaction): Promise<void> {
  await query(sql`/* lockCopyrightFormReview */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-form-review:${intakeId}`}, 0))
  `)
}

/** Start a genuinely new screen; this commits loss of automatic authority before any work. */
export async function startCopyrightFormScreening(
  intakeId: string,
): Promise<CopyrightFormScreeningAttempt> {
  await using transaction = await beginTransaction()
  const attempt = await startCopyrightFormScreeningInTransaction(intakeId, transaction)
  await transaction.commit()
  return attempt
}

export async function startCopyrightFormScreeningInTransaction(
  intakeId: string,
  transaction: Transaction,
): Promise<CopyrightFormScreeningAttempt> {
  await lockCopyrightFormReview(intakeId, transaction)
  const { rows } = await transaction<{
    attempt_number: number
  }>(sql`/* startCopyrightFormScreening */
    INSERT INTO copyright_notice_form_screening_executions (
      copyright_notice_form_intake_id, attempt_number, state, started_at
    ) VALUES (${intakeId}, 1, 'pending', clock_timestamp())
    ON CONFLICT (copyright_notice_form_intake_id) DO UPDATE
    SET attempt_number = copyright_notice_form_screening_executions.attempt_number + 1,
      state = 'pending', copyright_notice_form_screening_id = NULL,
      started_at = clock_timestamp(), claimed_at = NULL, completed_at = NULL,
      updated_at = clock_timestamp()
    RETURNING attempt_number
  `)
  return { intakeId, attemptNumber: rows[0]!.attempt_number }
}

/** A live duplicate does not run the provider; retrying a failed/expired claim rotates its token. */
export async function claimCopyrightFormScreening(
  intakeId: string,
): Promise<CopyrightFormScreeningAttempt | null> {
  await using transaction = await beginTransaction()
  await lockCopyrightFormReview(intakeId, transaction)
  const { rows } = await transaction<{
    attempt_number: number
  }>(sql`/* claimCopyrightFormScreening */
    UPDATE copyright_notice_form_screening_executions
    SET attempt_number = attempt_number + CASE WHEN state = 'failed' OR claimed_at IS NOT NULL THEN 1 ELSE 0 END,
      state = 'pending', copyright_notice_form_screening_id = NULL,
      started_at = CASE WHEN state = 'failed' OR claimed_at IS NOT NULL THEN clock_timestamp() ELSE started_at END,
      claimed_at = clock_timestamp(), completed_at = NULL, updated_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${intakeId}
      AND (state = 'failed' OR (state = 'pending'
        AND (claimed_at IS NULL OR claimed_at < clock_timestamp() - INTERVAL '15 minutes')))
    RETURNING attempt_number
  `)
  await transaction.commit()
  return rows[0] ? { intakeId, attemptNumber: rows[0].attempt_number } : null
}

export async function completeCopyrightFormScreening(
  attempt: CopyrightFormScreeningAttempt,
  input: CopyrightFormScreeningResultInput,
): Promise<string | null> {
  if (attempt.intakeId !== input.intakeId) throw new TypeError('Screening attempt intake mismatch')
  const guidance = parseCopyrightFormGuidance(input.guidance)
  await using transaction = await beginTransaction()
  await lockCopyrightFormReview(attempt.intakeId, transaction)
  const { rows: executions } = await transaction<{
    state: string
    copyright_notice_form_screening_id: string | null
  }>(sql`/* completeCopyrightFormScreening:attempt */
    SELECT state, copyright_notice_form_screening_id
    FROM copyright_notice_form_screening_executions
    WHERE copyright_notice_form_intake_id = ${attempt.intakeId} AND attempt_number = ${attempt.attemptNumber}
    FOR UPDATE
  `)
  const execution = executions[0]
  if (!execution || execution.state !== 'pending') {
    await transaction.commit()
    return execution?.state === 'completed' ? execution.copyright_notice_form_screening_id : null
  }
  const purpose = `copyright-form-screening:${input.intakeId}`
  const { rows } = await transaction<{ id: string }>(sql`/* completeCopyrightFormScreening:result */
    INSERT INTO copyright_notice_form_screenings (
      copyright_notice_form_intake_id, input_sha256, prompt_version, model, recommendation,
      rationale_ciphertext, guidance_ciphertext
    ) VALUES (${input.intakeId}, ${input.inputSha256}, ${input.promptVersion}, ${input.model},
      ${input.recommendation}, ${encryptSecret(input.rationale, purpose)},
      ${encryptSecret(JSON.stringify(guidance), purpose)})
    RETURNING id
  `)
  const id = rows[0]!.id
  await transaction(sql`/* completeCopyrightFormScreening */
    UPDATE copyright_notice_form_screening_executions
    SET state = 'completed', copyright_notice_form_screening_id = ${id},
      claimed_at = NULL, completed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${attempt.intakeId} AND attempt_number = ${attempt.attemptNumber}
  `)
  await transaction.commit()
  return id
}

export async function failCopyrightFormScreening(
  attempt: CopyrightFormScreeningAttempt,
): Promise<void> {
  await using transaction = await beginTransaction()
  await lockCopyrightFormReview(attempt.intakeId, transaction)
  await transaction(sql`/* failCopyrightFormScreening */
    UPDATE copyright_notice_form_screening_executions
    SET state = 'failed', claimed_at = NULL, completed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${attempt.intakeId}
      AND attempt_number = ${attempt.attemptNumber} AND state = 'pending'
  `)
  await transaction.commit()
}
