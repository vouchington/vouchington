import { beginTransaction } from '@data-stores/psql'
import { getPendingCopyrightStaffCase } from '../../../services/copyright-notices/read-models-staff-case.mts'

/** Reads a full staff case using the production projection in its own transaction. */
export async function readTestCopyrightStaffCase(noticeId: string) {
  await using transaction = await beginTransaction()
  return await getPendingCopyrightStaffCase(noticeId, transaction)
}
