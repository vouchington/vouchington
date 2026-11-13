import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { readCopyrightScreeningCoverage } from '@data-stores/psql/copyright-preservation-coverage'
import { parseCopyrightFormGuidance } from '../services/copyright-notices/form-screening-guidance.mts'
import { getCopyrightNoticesWorkLimit } from '../services/copyright-notices/work-limits.mts'
import {
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
} from '../services/copyright-notices/form-screening-executions.mts'

type CopyrightFormScreeningResultInput = Parameters<typeof completeCopyrightFormScreening>[1]

export async function appendTestCopyrightFormScreening(
  input: CopyrightFormScreeningResultInput,
): Promise<string> {
  const attempt = await claimCopyrightFormScreening(input.intakeId)
  if (!attempt) throw new Error('Copyright screening attempt is not claimable')
  const result = await completeCopyrightFormScreening(attempt, input)
  if (!result) throw new Error('Copyright screening attempt was superseded')
  return result
}

/** Complete only an owned idle setup attempt; worker subjects keep appendTestCopyrightFormScreening. */
export async function seedCompletedTestCopyrightFormScreening(
  input: CopyrightFormScreeningResultInput,
): Promise<string> {
  const guidance = parseCopyrightFormGuidance(input.guidance)
  await using transaction = await beginTransaction()
  await readCopyrightScreeningCoverage(transaction, input.intakeId)
  const { rows } = await transaction<{
    attempt_number: number
    state: string
    execution_started_at: Date | null
  }>(sql`/* seedCompletedTestCopyrightFormScreening:current */
    SELECT attempt_number, state, execution_started_at FROM copyright_notice_form_screening_attempts
    WHERE copyright_notice_form_intake_id = ${input.intakeId} ORDER BY attempt_number DESC LIMIT 1`)
  const current = rows[0]
  if (!current || current.state !== 'pending' || current.execution_started_at !== null)
    throw new Error('Completed screening setup requires its current idle pending attempt')
  const { rows: started } = await transaction<{
    execution_token: string
  }>(sql`/* seedCompletedTestCopyrightFormScreening:start */
    UPDATE copyright_notice_form_screening_attempts SET execution_started_at = clock_timestamp(), execution_token = uuidv7()
    WHERE copyright_notice_form_intake_id = ${input.intakeId} AND attempt_number = ${current.attempt_number}
      AND state = 'pending' AND execution_started_at IS NULL RETURNING execution_token`)
  const token = started[0]?.execution_token
  if (!token) throw new Error('Owned setup screening execution was no longer idle')
  const leaseMinutes = getCopyrightNoticesWorkLimit('screening_lease_minutes')
  const { rowCount: leased } =
    await transaction(sql`/* seedCompletedTestCopyrightFormScreening:work */
    UPDATE copyright_notice_form_screening_work_items work SET lease_token = ${token}::uuid,
      leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + ${leaseMinutes} * INTERVAL '1 minute', attempt_count = 1
    FROM copyright_notice_form_screening_attempts execution
    WHERE work.attempt_id = execution.id AND execution.copyright_notice_form_intake_id = ${input.intakeId}
      AND execution.attempt_number = ${current.attempt_number}`)
  if (leased !== 1) throw new Error('Owned setup screening work item disappeared')
  const purpose = `copyright-form-screening:${input.intakeId}`
  const { rows: results } = await transaction<{
    id: string
  }>(sql`/* seedCompletedTestCopyrightFormScreening:result */
    INSERT INTO copyright_notice_form_screenings (copyright_notice_form_intake_id, input_sha256,
      prompt_version, model, recommendation, rationale_ciphertext, guidance_ciphertext)
    SELECT intake.id, ${input.inputSha256}, ${input.promptVersion}, ${input.model}, ${input.recommendation},
      ${encryptSecret(input.rationale, purpose)}, ${encryptSecret(JSON.stringify(guidance), purpose)}
    FROM copyright_notice_form_intakes intake JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    WHERE intake.id = ${input.intakeId} AND notice.evidence_erased_at IS NULL RETURNING id`)
  const id = results[0]?.id
  if (!id) throw new Error('Owned setup screening has no live intake')
  const { rowCount: completed } =
    await transaction(sql`/* seedCompletedTestCopyrightFormScreening:complete */
    UPDATE copyright_notice_form_screening_attempts SET copyright_notice_form_screening_id = ${id}, completed_at = clock_timestamp()
    WHERE copyright_notice_form_intake_id = ${input.intakeId} AND attempt_number = ${current.attempt_number}
      AND execution_token = ${token} AND state = 'pending'
      AND EXISTS (SELECT 1 FROM copyright_notice_form_screening_work_items work
        WHERE work.attempt_id = copyright_notice_form_screening_attempts.id AND work.lease_token = ${token}::uuid
          AND work.lease_expires_at > clock_timestamp())`)
  if (completed !== 1)
    throw new Error('Owned setup screening did not complete its current execution')
  await transaction.commit()
  return id
}
