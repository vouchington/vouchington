import { beginTransaction } from '@data-stores/psql'
import { selectStaffTargets } from '../services/copyright-notices/read-models-staff-notice.mts'

/** Reads only staff target fields through the production projection. */
export async function readTestCopyrightStaffTargetProjection(noticeId: string) {
  await using transaction = await beginTransaction()
  const targets = await selectStaffTargets(noticeId, transaction)
  await transaction.commit()
  return targets
}
