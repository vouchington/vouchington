import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
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

/** Keep the actual read-committed reader transaction around a deterministic candidate barrier. */
export async function withTestCopyrightStaffReaderTransaction<Result>(
  run: (query: TransactionQuery, isolation: string) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  const { rows } = await query<{ isolation: string }>(
    `/* assertStaffQueueReaderIsolation */
    SELECT current_setting('transaction_isolation') AS isolation`,
  )
  const result = await run(query, rows[0]!.isolation)
  await query.commit()
  return result
}
