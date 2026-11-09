import type { TransactionQuery } from '@data-stores/psql'
import type sql from 'sql-template-strings'

/** Deletes the two stored directions while their shared relation-pair lock is held. */
export async function deleteBidirectionalRelationRows(
  query: TransactionQuery,
  forwardQuery: ReturnType<typeof sql>,
  reverseQuery: ReturnType<typeof sql>,
): Promise<void> {
  await query(forwardQuery)
  await query(reverseQuery)
}
