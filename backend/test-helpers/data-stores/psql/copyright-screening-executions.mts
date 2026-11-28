import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { getPendingCopyrightStaffCases } from '../../../services/copyright-notices/read-models-staff-case.mts'
import type { CopyrightFormGuidance } from '../../../services/copyright-notices/form-screening-guidance.mts'

export async function eraseTestCopyrightFormRequester(intakeId: string): Promise<void> {
  await write(sql`/* eraseTestCopyrightFormRequester */
    DELETE FROM users WHERE id = (
      SELECT requester_user_id FROM copyright_notice_form_intakes WHERE id = ${intakeId}
    )
  `)
}

export async function selectTestCopyrightScreeningResult(
  intakeId: string,
  screeningId: string,
): Promise<void> {
  await write(sql`/* selectTestCopyrightScreeningResult */
    INSERT INTO copyright_notice_form_screening_attempts(copyright_notice_form_intake_id, attempt_number,
      copyright_notice_form_screening_id, started_at, completed_at)
    SELECT ${intakeId}, MAX(attempt_number) + 1, ${screeningId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM copyright_notice_form_screening_attempts WHERE copyright_notice_form_intake_id = ${intakeId}
  `)
}

/** Appends a new completed clear screening attempt on an intake that already completed once. */
export async function appendTestReplacementClearCopyrightScreening(input: {
  intakeId: string
  guidance: CopyrightFormGuidance
}): Promise<string> {
  const purpose = `copyright-form-screening:${input.intakeId}`
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`
    /* appendTestReplacementClearCopyrightScreening:result */
    INSERT INTO copyright_notice_form_screenings (
      copyright_notice_form_intake_id, input_sha256, prompt_version, model, recommendation,
      rationale_ciphertext, guidance_ciphertext
    ) VALUES (
      ${input.intakeId}, ${Buffer.alloc(32, 2)}, 'copyright-form-screening-v2', 'test-model',
      'not_obviously_invalid', ${encryptSecret('Replacement clear screen.', purpose)},
      ${encryptSecret(JSON.stringify(input.guidance), purpose)}
    )
    RETURNING id
  `)
  const screeningId = rows[0]!.id
  await transaction(sql`/* appendTestReplacementClearCopyrightScreening:attempt */
    INSERT INTO copyright_notice_form_screening_attempts (
      copyright_notice_form_intake_id, attempt_number,
      copyright_notice_form_screening_id, started_at, completed_at
    )
    SELECT ${input.intakeId}, MAX(attempt_number) + 1, ${screeningId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM copyright_notice_form_screening_attempts WHERE copyright_notice_form_intake_id = ${input.intakeId}
  `)
  await transaction.commit()
  return screeningId
}

export async function readTestCopyrightScreeningExecution(intakeId: string) {
  const { rows } = await write<{
    attempt_number: number
    state: 'pending' | 'failed' | 'completed'
    copyright_notice_form_screening_id: string | null
    started_at: Date
    claimed_at: Date | null
    completed_at: Date | null
    failed_at: Date | null
  }>(sql`/* readTestCopyrightScreeningExecution */
    SELECT attempt_number, state, copyright_notice_form_screening_id,
      started_at, execution_started_at AS claimed_at, completed_at, failed_at
    FROM copyright_notice_form_screening_attempts
    WHERE copyright_notice_form_intake_id = ${intakeId} ORDER BY attempt_number DESC LIMIT 1
  `)
  if (!rows[0]) throw new Error('Expected owned screening execution')
  return rows[0]
}

export async function readTestCopyrightStaffScreening(noticeId: string) {
  await using transaction = await beginTransaction()
  const staffCases = await getPendingCopyrightStaffCases([noticeId], transaction)
  const result = staffCases.get(noticeId)?.form_review?.screening
  await transaction.commit()
  return result
}

/** Move the retry cutoff forward without rewriting the immutable claim facts. */
export async function getTestExpiredCopyrightScreeningClaimTime(intakeId: string): Promise<Date> {
  const { rows } = await write<{ cutoff: Date }>(sql`/* getTestExpiredCopyrightScreeningClaimTime */
    SELECT execution_started_at + INTERVAL '16 minutes' AS cutoff
    FROM copyright_notice_form_screening_attempts WHERE copyright_notice_form_intake_id = ${intakeId}
    ORDER BY attempt_number DESC LIMIT 1
  `)
  return rows[0]!.cutoff
}
