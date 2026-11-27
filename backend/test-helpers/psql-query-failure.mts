import { beginTransaction, type QueryOptions } from '@data-stores/psql'
import {
  withFailingTransactionQueryOptionsForTest as withFailingTargetTransactionQueryOptions,
  withForcedTransactionRollbackForTest as withForcedTargetTransactionRollback,
  type ManagedSqlTransaction,
} from 'vouchington-tooling/postgres-test-faults'

const beginManagedTransaction = beginTransaction as unknown as () => Promise<ManagedSqlTransaction>

export function withForcedTransactionRollbackForTest(
  handler: (options: QueryOptions) => Promise<unknown>,
): Promise<never> {
  return withForcedTargetTransactionRollback(beginManagedTransaction, options =>
    handler(options as unknown as QueryOptions),
  )
}

export function withFailingTransactionQueryOptionsForTest<Result>(
  annotation: string,
  handler: (options: QueryOptions) => Promise<Result>,
): Promise<Result> {
  return withFailingTargetTransactionQueryOptions(beginManagedTransaction, annotation, options =>
    handler(options as unknown as QueryOptions),
  )
}
