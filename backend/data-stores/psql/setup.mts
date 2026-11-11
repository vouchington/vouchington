import { AsyncLocalStorage } from 'node:async_hooks'
import onError from '@modules/on-error'
import type {
  BeginTransactionOptions,
  BoundedTransactionOptions,
  Psql,
  Transaction,
} from '@vouchington/postgres'
import { normalizeTopicReferenceQuery } from './topic-reference-errors.mts'
import { psql } from './runtime.mts'
import { captureTransactionQuery as captureQuery } from './query-capture.mts'
import type { QueryExecutor, QueryOptions, PoolClient, TransactionQuery } from './types.mts'

type AdapterTransactionOptions = Psql['withTransactionOptions']
export type OwnedTransaction = Transaction

type PostCommitAction = () => Promise<void>
type PostCommitActionScope = {
  owner: QueryExecutor
  actions: PostCommitAction[]
  parent?: PostCommitActionScope
}

const postCommitActions = new WeakMap<QueryExecutor, PostCommitAction[]>()
const postCommitActionOwners = new WeakMap<QueryExecutor, QueryExecutor>()
const postCommitActionOwnersByClient = new WeakMap<PoolClient, QueryExecutor>()
const postCommitActionScopes = new AsyncLocalStorage<PostCommitActionScope>()

const runWithTransactionOptions = psql.withTransactionOptions as AdapterTransactionOptions

export async function beginTransaction(
  options: BeginTransactionOptions & { serializable?: boolean } = {},
): Promise<OwnedTransaction> {
  const { serializable, ...adapterOptions } = options
  const transaction = ownTransaction(await psql.beginTransaction(adapterOptions))
  if (!serializable) return transaction
  try {
    // Must run before the transaction's first query so its snapshot is SERIALIZABLE.
    await transaction('/* beginSerializable */ SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
  } catch (err) {
    await transaction.rollback()
    throw err
  }
  return transaction
}

export async function beginBoundedTransaction(
  options: BoundedTransactionOptions,
): Promise<OwnedTransaction> {
  return ownTransaction(await psql.beginBoundedTransaction(options))
}

export function registerPostCommitAction(query: QueryExecutor, action: PostCommitAction): void {
  const scope = postCommitActionScopes.getStore()
  const owner = postCommitActionOwners.get(query) ?? scope?.owner
  if (!owner) {
    throw new Error(
      'Post-commit actions require a transaction query owned by @data-stores/psql wrappers',
    )
  }
  if (scope?.owner === owner) {
    scope.actions.push(action)
    return
  }
  const actions = postCommitActions.get(owner) ?? []
  actions.push(action)
  postCommitActions.set(owner, actions)
}

export async function withTransactionOptions<Result>(
  options: QueryOptions,
  handler: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const owner = options.query
    ? (postCommitActionOwners.get(options.query) ??
      (isTransactionQuery(options.query)
        ? postCommitActionOwnersByClient.get(options.query.client)
        : undefined))
    : isPoolClient(options.client)
      ? postCommitActionOwnersByClient.get(options.client)
      : undefined
  const parentScope = postCommitActionScopes.getStore()
  const scope: PostCommitActionScope | undefined = owner
    ? { owner, actions: [], parent: parentScope?.owner === owner ? parentScope : undefined }
    : undefined
  const result = await runWithTransactionOptions(options, async query => {
    const captureAwareQuery = postCommitActionOwners.has(query)
      ? query
      : captureQuery(normalizeTopicReferenceQuery(query))
    return scope
      ? postCommitActionScopes.run(scope, () => handler(captureAwareQuery))
      : handler(captureAwareQuery)
  })
  if (scope) commitPostCommitActionScope(scope)
  return result
}

function isTransactionQuery(query: QueryExecutor): query is TransactionQuery {
  return 'client' in query && isPoolClient(query.client)
}
async function runPostCommitActions(query: QueryExecutor): Promise<void> {
  const actions = postCommitActions.get(query)
  postCommitActions.delete(query)
  if (!actions) return
  const results = await Promise.allSettled(actions.map(async action => action()))
  for (const result of results) {
    if (result.status === 'rejected')
      onError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
  }
}

function ownTransaction(transaction: OwnedTransaction): OwnedTransaction {
  const ownedTransaction = captureQuery(normalizeTopicReferenceQuery(transaction))
  postCommitActionOwners.set(ownedTransaction, ownedTransaction)
  postCommitActionOwnersByClient.set(ownedTransaction.client, ownedTransaction)

  const commit = transaction.commit
  const rollback = transaction.rollback
  const dispose = transaction[Symbol.asyncDispose]
  const detachClientOwnership = () => {
    if (postCommitActionOwnersByClient.get(ownedTransaction.client) === ownedTransaction)
      postCommitActionOwnersByClient.delete(ownedTransaction.client)
  }
  const clearOwnership = () => {
    postCommitActions.delete(ownedTransaction)
    postCommitActionOwners.delete(ownedTransaction)
    detachClientOwnership()
  }

  Object.assign(ownedTransaction, {
    commit: async () => {
      detachClientOwnership()
      try {
        await commit()
        await runPostCommitActions(ownedTransaction)
      } finally {
        clearOwnership()
      }
    },
    rollback: async () => {
      detachClientOwnership()
      try {
        await rollback()
      } finally {
        clearOwnership()
      }
    },
    [Symbol.asyncDispose]: async () => {
      detachClientOwnership()
      try {
        await dispose()
      } finally {
        clearOwnership()
      }
    },
  })

  return ownedTransaction
}

function commitPostCommitActionScope(scope: PostCommitActionScope): void {
  const actions = scope.parent?.actions ?? postCommitActions.get(scope.owner) ?? []
  actions.push(...scope.actions)
  if (!scope.parent) postCommitActions.set(scope.owner, actions)
}
function isPoolClient(client: unknown): client is PoolClient {
  return typeof client === 'object' && client !== null && 'release' in client
}
export * from './runtime.mts'
