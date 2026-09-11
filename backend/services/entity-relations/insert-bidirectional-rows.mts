import type { TransactionQuery } from '@data-stores/psql'
import type sql from 'sql-template-strings'

/** Inserts the two stored directions after their user-subject fence is held. */
export async function insertBidirectionalRelationRows<T>(
  query: TransactionQuery,
  forwardQuery: ReturnType<typeof sql>,
  reverseQuery: ReturnType<typeof sql>,
): Promise<{ relations: T[]; reverseRelations: T[] }> {
  const { rows } = await query(forwardQuery)
  const { rows: reverseRows } = await query(reverseQuery)
  return {
    relations: rows as T[],
    reverseRelations: reverseRows as T[],
  }
}
