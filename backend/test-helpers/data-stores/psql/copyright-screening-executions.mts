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
    error => ({ value: null, error }),
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
    error => ({ value: null, error }),
  )
  await waitForTestPostgresLockWaiter(pid, 'lockAssessmentForm:fence')
  await transaction.commit()
  const result = await admission
  if (result.error) throw result.error
  return result.value as T
}
