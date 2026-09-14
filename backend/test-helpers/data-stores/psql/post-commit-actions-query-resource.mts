import { write } from '@data-stores/psql'
import { beginTransaction, withTransactionOptions } from '@data-stores/psql/setup'

type TestTransaction = Awaited<ReturnType<typeof beginTransaction>>

async function withRolledBackTransaction(
  capture: (transaction: TestTransaction) => Promise<unknown>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await capture(transaction)
  await transaction.rollback()
}

export function captureOwnedTransactionQuery(): Promise<void> {
  return withRolledBackTransaction(transaction =>
    transaction('/* ownedTransactionCapture */ SELECT $1::integer', [1]),
  )
}

export function captureExplicitTransactionQuery(): Promise<void> {
  return withRolledBackTransaction(transaction =>
    withTransactionOptions({ query: transaction }, query =>
      write('/* explicitQueryCapture */ SELECT $1::integer', [1], { query }),
    ),
  )
}

export function captureBorrowedClientTransactionQuery(): Promise<void> {
  return withRolledBackTransaction(transaction =>
    withTransactionOptions({ client: transaction.client }, query =>
      write('/* borrowedClientCapture */ SELECT $1::integer', [1], { query }),
    ),
  )
}

export async function captureInternallyOwnedTransactionQuery(): Promise<void> {
  await withTransactionOptions({}, query =>
    write('/* internalTransactionCapture */ SELECT $1::integer', [1], { query }),
  )
}
