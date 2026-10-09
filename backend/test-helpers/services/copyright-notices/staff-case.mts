import { beginTransaction } from '@data-stores/psql'
import { getPendingCopyrightStaffCases } from '../../../services/copyright-notices/read-models-staff-case.mts'

/** Reads a full staff case using the production projection in its own transaction. */
export async function readTestCopyrightStaffCase(noticeId: string) {
  return (await readTestCopyrightStaffCases([noticeId])).get(noticeId) ?? null
}

/** Reads the staff cases of every listed notice with the production batch projection. */
export async function readTestCopyrightStaffCases(noticeIds: readonly string[]) {
  await using transaction = await beginTransaction()
  const cases = await getPendingCopyrightStaffCases(noticeIds, transaction)
  await transaction.commit()
  return cases
}
