import sql from 'sql-template-strings'
import {
  beginBoundedTransaction,
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
} from '@data-stores/psql/setup'
import { writePool, type PoolClient } from '@data-stores/psql'

type PostCommitAction = () => Promise<void>

export async function runExplicitCommitActionProbe(action: PostCommitAction): Promise<boolean> {
  let ranBeforeCommit = false
  await using transaction = await beginTransaction()
  registerPostCommitAction(transaction, async () => {
    ranBeforeCommit = true
    await action()
  })
  await transaction(sql`/* post-commit actions explicit commit */ SELECT 1`)
  const actionRanBeforeCommit = ranBeforeCommit
  await transaction.commit()
  return actionRanBeforeCommit
}

export async function rejectPostCommitActionOnExternalTransaction(
  action: PostCommitAction,
): Promise<void> {
  const client = await writePool.connect()
  let transactionOpen = false
  try {
    // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- verifies an externally owned transaction cannot claim post-commit actions
    await client.query('/* post-commit actions external begin */ BEGIN')
    transactionOpen = true
    await withTransactionOptions({ client }, async query => {
      registerPostCommitAction(query, action)
    })
  } finally {
    if (transactionOpen) {
      // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- restore the externally owned transaction after the ownership regression
      await client.query('/* post-commit actions external rollback */ ROLLBACK')
    }
    client.release()
  }
}

export async function recordIdleBorrowedTransactionQueries(): Promise<string[]> {
  const client = await writePool.connect()
  try {
    return await recordClientQueryTexts(client, () =>
      withTransactionOptions({ client }, query =>
        query('/* idle borrowed withTransactionOptions probe */ SELECT 1'),
      ),
    )
  } finally {
    client.release()
  }
}

export async function recordNestedOwnedBorrowedClientQueries(): Promise<string[]> {
  await using transaction = await beginTransaction()
  return await recordClientQueryTexts(transaction.client, () =>
    withTransactionOptions({ client: transaction.client }, query =>
      query('/* nested owned borrowed-client probe */ SELECT 1'),
    ),
  )
}

async function recordClientQueryTexts(
  client: PoolClient,
  operation: () => Promise<unknown>,
): Promise<string[]> {
  const query = client.query
  const texts: string[] = []
  client.query = ((...args: unknown[]) => {
    texts.push(clientQueryText(args[0]))
    return Reflect.apply(query, client, args) as ReturnType<PoolClient['query']>
  }) as PoolClient['query']
  try {
    await operation()
    return texts
  } finally {
    client.query = query
  }
}

function clientQueryText(input: unknown): string {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object' && 'text' in input) {
    const text = (input as { text: unknown }).text
    if (typeof text === 'string') return text
  }
  return String(input)
}

export async function runFailedBoundedPostCommitActionProbe(action: PostCommitAction): Promise<{
  queryError: Error
  commitError: Error
  postFailureRegistrationError: Error
}> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
  })
  registerPostCommitAction(transaction, action)
  const queryError = await getExpectedError(() =>
    transaction(sql`/* post-commit actions failed bounded commit */ SELECT 1 / 0`),
  )
  const commitError = await getExpectedError(() => transaction.commit())
  const postFailureRegistrationError = getExpectedSynchronousError(() =>
    registerPostCommitAction(transaction, action),
  )
  return { queryError, commitError, postFailureRegistrationError }
}

async function getExpectedError(operation: () => Promise<unknown>): Promise<Error> {
  try {
    await operation()
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
  throw new Error('Expected post-commit action probe operation to fail')
}

function getExpectedSynchronousError(operation: () => void): Error {
  try {
    operation()
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
  throw new Error('Expected post-commit action probe registration to fail')
}
