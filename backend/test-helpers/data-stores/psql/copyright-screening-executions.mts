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
    UPDATE copyright_notice_form_screening_executions
    SET copyright_notice_form_screening_id = ${screeningId}
    WHERE copyright_notice_form_intake_id = ${intakeId}
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
    updated_at: Date
  }>(sql`/* readTestCopyrightScreeningExecution */
    SELECT attempt_number, state, copyright_notice_form_screening_id,
      started_at, claimed_at, completed_at, updated_at
    FROM copyright_notice_form_screening_executions
    WHERE copyright_notice_form_intake_id = ${intakeId}
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

export async function expireTestCopyrightScreeningClaim(intakeId: string): Promise<void> {
  await write(sql`/* expireTestCopyrightScreeningClaim */
    UPDATE copyright_notice_form_screening_executions
    SET started_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes',
      claimed_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes'
    WHERE copyright_notice_form_intake_id = ${intakeId} AND state = 'pending'
  `)
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
