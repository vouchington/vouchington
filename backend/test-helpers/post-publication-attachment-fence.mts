import {
  beginTransaction,
  withTransactionOptions,
  writePool,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Inject one failed query execution without failing the real PostgreSQL transaction. */
export function createFailOnceAttachmentFenceQuery(query: TransactionQuery): TransactionQuery {
  let failNext = true
  return new Proxy(query, {
    apply(target, thisArg, args) {
      if (failNext) {
        failNext = false
        throw new Error('Injected attachment fence query failure')
      }
      return Reflect.apply(target, thisArg, args)
    },
  })
}

/** Give each borrowed callback a fresh query object across a real savepoint rollback. */
export async function withRolledBackBorrowedAttachmentFenceScope(
  first: (query: TransactionQuery) => Promise<void>,
  afterRollback: (
    runBorrowed: (operation: (query: TransactionQuery) => Promise<void>) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  const client = await writePool.connect()
  try {
    await using transaction = await beginTransaction({ client })
    await transaction(
      sql`/* withRolledBackBorrowedAttachmentFenceScope:start */ SAVEPOINT attachment_fence_test`,
    )
    await withTransactionOptions({ client }, first)
    await transaction(
      sql`/* withRolledBackBorrowedAttachmentFenceScope:rollback */ ROLLBACK TO SAVEPOINT attachment_fence_test`,
    )
    await transaction(
      sql`/* withRolledBackBorrowedAttachmentFenceScope:release */ RELEASE SAVEPOINT attachment_fence_test`,
    )
    await afterRollback(operation => withTransactionOptions({ client }, operation))
    await transaction.commit()
  } finally {
    client.release()
  }
}
