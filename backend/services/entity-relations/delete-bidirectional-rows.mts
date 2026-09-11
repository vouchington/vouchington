import type { TransactionQuery } from '@data-stores/psql'
import type sql from 'sql-template-strings'

/** Deletes the two stored directions after their user-subject fence is held. */
export async function deleteBidirectionalRelationRows(
  query: TransactionQuery,
  forwardQuery: ReturnType<typeof sql>,
  reverseQuery: ReturnType<typeof sql>,
): Promise<void> {
  await query(forwardQuery)
  await query(reverseQuery)
}
