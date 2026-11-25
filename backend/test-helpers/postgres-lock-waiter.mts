import { beginTransaction, writePool, type OwnedTransaction } from '@data-stores/psql'
import {
  createTestPostgresLockWaiter as createPoolLockWaiter,
  type TestLockWaiterHeldLock,
  type TestPostgresLockQuery,
} from 'vouchington-tooling/postgres-test-faults'
import { testLockNoticeOptions } from './postgres-lock-notice-options.mts'

/** Own the holder's failure release and one real borrowed contender transaction. */
export function createTestPostgresLockWaiter(options: {
  holder: OwnedTransaction
  lock: TestLockWaiterHeldLock
  selected: TestPostgresLockQuery
}) {
  return createPoolLockWaiter({
    pool: writePool,
    holder: {
      query: ({ text, values }) => options.holder(text, values),
      release: async () => {
        await options.holder[Symbol.asyncDispose]()
      },
    },
    beginTransaction: client => beginTransaction({ client }),
    lock: options.lock,
    selected: options.selected,
    notice: testLockNoticeOptions,
  })
}
