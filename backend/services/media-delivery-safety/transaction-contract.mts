import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'

export function assertImageDeliveryTransaction(
  query: QueryExecutor,
): asserts query is TransactionQuery {
  if (!('client' in query))
    throw new Error('Media delivery authority requires a retained transaction')
}
