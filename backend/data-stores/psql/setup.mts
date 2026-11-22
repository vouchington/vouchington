import onError from '@modules/on-error'
import {
  createPostCommitActions,
  type BeginTransactionOptions,
  type BoundedTransactionOptions,
  type Transaction,
} from '@vouchington/postgres'
import { normalizeTopicReferenceQuery } from './topic-reference-errors.mts'
import { psql } from './runtime.mts'
import { captureTransactionQuery as captureQuery } from './query-capture.mts'
import type { QueryOptions, TransactionQuery } from './types.mts'

export type OwnedTransaction = Transaction

const postCommitActions = createPostCommitActions({
  reportError: onError,
  unownedMessage:
    'Post-commit actions require a transaction query owned by @data-stores/psql wrappers',
})

export const registerPostCommitAction = postCommitActions.register

const decorateQuery = <Query extends TransactionQuery>(query: Query): Query =>
  captureQuery(normalizeTopicReferenceQuery(query))

function ownTransaction(transaction: OwnedTransaction): OwnedTransaction {
  return postCommitActions.own(transaction, decorateQuery(transaction))
}

export async function beginTransaction(
  options: BeginTransactionOptions & { serializable?: boolean } = {},
): Promise<OwnedTransaction> {
  const { serializable, ...adapterOptions } = options
  return ownTransaction(
    await psql.beginTransaction(
      serializable ? { ...adapterOptions, isolationLevel: 'serializable' } : adapterOptions,
    ),
  )
}

export async function beginBoundedTransaction(
  options: BoundedTransactionOptions,
): Promise<OwnedTransaction> {
  return ownTransaction(await psql.beginBoundedTransaction(options))
}

export function withTransactionOptions<Result>(
  options: QueryOptions,
  handler: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  return postCommitActions.withTransactionOptions(
    psql.withTransactionOptions,
    options,
    handler,
    decorateQuery,
  )
}

export * from './runtime.mts'
