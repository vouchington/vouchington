import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPendingCopyrightStaffCases } from '../../../services/copyright-notices/read-models-staff-case.mts'
import { claimCopyrightFormScreening } from '../../../services/copyright-notices/form-screening-executions.mts'
import {
  getTestPostgresBackendProcessId,
  getTestPostgresAdvisoryLockHolderProcessId,
  waitForTestPostgresLockWaiter,
} from '../../postgres-lock-wait.mts'

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

/** Retains actual form authority until PostgreSQL confirms admission is waiting behind it. */
export async function startTestCopyrightScreeningBeforeAdmission<T>(
  intakeId: string,
  admit: () => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* startTestCopyrightScreeningBeforeAdmission:holdAttempt */
    SELECT id FROM copyright_notice_form_screening_attempts
    WHERE copyright_notice_form_intake_id = ${intakeId}
    ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE
  `)
  const pid = await getTestPostgresBackendProcessId(transaction)
  const screening = claimCopyrightFormScreening(intakeId).then(
    value => ({ value, error: null }),
    err => ({ value: null, error: err }),
  )
  await waitForTestPostgresLockWaiter(pid, 'claimCopyrightFormScreening:current')
  const screeningPid = await getTestPostgresAdvisoryLockHolderProcessId({
    key: `copyright-form-review:${intakeId}`,
  })
  const admission = admit().then(
    value => ({ value, error: null }),
    err => ({ value: null, error: err }),
  )
  await waitForTestPostgresLockWaiter(screeningPid, 'lockAssessmentForm:fence')
  await transaction.commit()
  const [screeningResult, result] = await Promise.all([screening, admission])
  if (screeningResult.error) throw screeningResult.error
  if (!screeningResult.value) throw new Error('Copyright screening retry was not claimed')
  if (result.error) throw result.error
  return result.value as T
}
