import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPendingCopyrightStaffCase } from '../../../services/copyright-notices/read-models-staff-case.mts'
import {
  lockCopyrightFormReview,
  startCopyrightFormScreening,
  startCopyrightFormScreeningInTransaction,
} from '../../../services/copyright-notices/form-screening-executions.mts'
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

/** Stops real admission after its form fence, then observes a new screen waiting behind it. */
export async function admitTestCopyrightBeforeScreening<T>(
  noticeId: string,
  intakeId: string,
  admit: () => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* admitTestCopyrightBeforeScreening:notice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  const pid = await getTestPostgresBackendProcessId(transaction)
  const admission = admit().then(
    value => ({ value, error: null }),
    err => ({ value: null, error: err }),
  )
  await waitForTestPostgresLockWaiter(pid, 'acceptCopyrightNoticeAndImposeRestriction:lockNotice')
  const admissionPid = await getTestPostgresAdvisoryLockHolderProcessId({
    key: `copyright-form-review:${intakeId}`,
  })
  const screening = startCopyrightFormScreening(intakeId)
  await waitForTestPostgresLockWaiter(admissionPid, 'lockCopyrightFormReview')
  await transaction.commit()
  const result = await admission
  await screening
  if (result.error) throw result.error
  return result.value as T
}

export async function readTestCopyrightStaffScreening(noticeId: string) {
  await using transaction = await beginTransaction()
  const result = (await getPendingCopyrightStaffCase(noticeId, transaction))?.form_review?.screening
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
  await lockCopyrightFormReview(intakeId, transaction)
  await startCopyrightFormScreeningInTransaction(intakeId, transaction)
  const pid = await getTestPostgresBackendProcessId(transaction)
  const admission = admit().then(
    value => ({ value, error: null }),
    err => ({ value: null, error: err }),
  )
  await waitForTestPostgresLockWaiter(pid, 'lockAssessmentForm:fence')
  await transaction.commit()
  const result = await admission
  if (result.error) throw result.error
  return result.value as T
}
