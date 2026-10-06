import { getCopyrightNoticesWorkLimit } from './work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  type CopyrightFormGuidance,
  parseCopyrightFormGuidance,
} from './form-screening-guidance.mts'

type Transaction = Awaited<ReturnType<typeof beginTransaction>>
export type CopyrightFormScreeningAttempt = {
  intakeId: string
  attemptNumber: number
  leaseToken: string
}
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
  await transaction(sql`/* startCopyrightFormScreening:finishPrior */
    UPDATE copyright_notice_form_screening_attempts SET failed_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${intakeId} AND state = 'pending'
  `)
  const { rows } = await transaction<{
    attempt_number: number
    execution_token: string
  }>(sql`/* startCopyrightFormScreening */
    INSERT INTO copyright_notice_form_screening_attempts (copyright_notice_form_intake_id, attempt_number)
    SELECT ${intakeId}, COALESCE(MAX(attempt_number), 0) + 1
    FROM copyright_notice_form_screening_attempts WHERE copyright_notice_form_intake_id = ${intakeId}
    RETURNING attempt_number, execution_token
  `)
  return { intakeId, attemptNumber: rows[0]!.attempt_number, leaseToken: rows[0]!.execution_token }
}

/** A live duplicate does not run the provider; retrying a failed/expired claim rotates its token. */
export async function claimCopyrightFormScreening(
  intakeId: string,
  claimBefore = new Date(),
): Promise<CopyrightFormScreeningAttempt | null> {
  await using transaction = await beginTransaction()
  await lockCopyrightFormReview(intakeId, transaction)
  const { rows: currentRows } = await transaction<{
    attempt_number: number
    execution_token: string
    state: string
    execution_started_at: Date | null
    expired: boolean
  }>(sql`/* claimCopyrightFormScreening:current */
    SELECT attempt_number, execution_token, state, execution_started_at,
      EXISTS (SELECT 1 FROM copyright_notice_form_screening_work_items work WHERE work.attempt_id = copyright_notice_form_screening_attempts.id AND work.lease_expires_at <= ${claimBefore}) AS expired
    FROM copyright_notice_form_screening_attempts WHERE copyright_notice_form_intake_id = ${intakeId}
    ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE
  `)
  const current = currentRows[0]
  if (
    !current ||
    current.state === 'completed' ||
    (current.state === 'pending' && current.execution_started_at && !current.expired)
  ) {
    await transaction.commit()
    return null
  }
  const attempt =
    current.state === 'failed' || current.expired
      ? await startCopyrightFormScreeningInTransaction(intakeId, transaction)
      : { intakeId, attemptNumber: current.attempt_number, leaseToken: current.execution_token }
  const { rows: claims } = await transaction<{
    execution_token: string
  }>(sql`/* claimCopyrightFormScreening */
    UPDATE copyright_notice_form_screening_attempts SET execution_started_at = clock_timestamp(), execution_token = uuidv7()
    WHERE copyright_notice_form_intake_id = ${intakeId} AND attempt_number = ${attempt.attemptNumber}
    RETURNING execution_token
  `)
  const leaseMinutes = getCopyrightNoticesWorkLimit('screening_lease_minutes')
  await transaction(sql`/* claimCopyrightFormScreening:work */
    UPDATE copyright_notice_form_screening_work_items work
    SET lease_token = ${claims[0]!.execution_token}::uuid, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${leaseMinutes} * interval '1 minute', attempt_count = 1
    FROM copyright_notice_form_screening_attempts execution
    WHERE work.attempt_id = execution.id AND execution.copyright_notice_form_intake_id = ${intakeId}
      AND execution.attempt_number = ${attempt.attemptNumber}
  `)
  await transaction.commit()
  return { ...attempt, leaseToken: claims[0]!.execution_token }
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
    FROM copyright_notice_form_screening_attempts
    WHERE copyright_notice_form_intake_id = ${attempt.intakeId} AND attempt_number = ${attempt.attemptNumber} AND execution_token = ${attempt.leaseToken}
      AND (state = 'completed' OR EXISTS (SELECT 1 FROM copyright_notice_form_screening_work_items work
        WHERE work.attempt_id = copyright_notice_form_screening_attempts.id
          AND (work.lease_token IS NULL OR (work.lease_token = ${attempt.leaseToken}::uuid AND work.lease_expires_at > clock_timestamp()))))
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_screening_attempts newer WHERE newer.copyright_notice_form_intake_id = ${attempt.intakeId} AND newer.attempt_number > ${attempt.attemptNumber})
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
  const { rowCount } = await transaction(sql`/* completeCopyrightFormScreening */
    UPDATE copyright_notice_form_screening_attempts
    SET copyright_notice_form_screening_id = ${id}, completed_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${attempt.intakeId} AND attempt_number = ${attempt.attemptNumber} AND execution_token = ${attempt.leaseToken}
      AND EXISTS (SELECT 1 FROM copyright_notice_form_screening_work_items work
        WHERE work.attempt_id = copyright_notice_form_screening_attempts.id
          AND (work.lease_token IS NULL OR (work.lease_token = ${attempt.leaseToken}::uuid AND work.lease_expires_at > clock_timestamp())))
  `)
  if (rowCount !== 1) return null
  await transaction.commit()
  return id
}

export async function failCopyrightFormScreening(
  attempt: CopyrightFormScreeningAttempt,
): Promise<void> {
  await using transaction = await beginTransaction()
  await lockCopyrightFormReview(attempt.intakeId, transaction)
  await transaction(sql`/* failCopyrightFormScreening */
    UPDATE copyright_notice_form_screening_attempts
    SET failed_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${attempt.intakeId}
      AND attempt_number = ${attempt.attemptNumber} AND execution_token = ${attempt.leaseToken}
      AND EXISTS (SELECT 1 FROM copyright_notice_form_screening_work_items work
        WHERE work.attempt_id = copyright_notice_form_screening_attempts.id
          AND (work.lease_token IS NULL OR (work.lease_token = ${attempt.leaseToken}::uuid AND work.lease_expires_at > clock_timestamp()))) AND state = 'pending'
  `)
  await transaction.commit()
}
