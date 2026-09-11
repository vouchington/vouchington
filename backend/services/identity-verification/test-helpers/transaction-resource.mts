import type { OwnedTransaction, QueryExecutor } from '@data-stores/psql'
import { vi } from 'vitest'

export function createTransactionResource(query: QueryExecutor): OwnedTransaction {
  return Object.assign(query, {
    client: {},
    commit: vi.fn<() => Promise<void>>(async () => {}),
    rollback: vi.fn<() => Promise<void>>(async () => {}),
    [Symbol.asyncDispose]: vi.fn<() => Promise<void>>(async () => {}),
  }) as unknown as OwnedTransaction
}
