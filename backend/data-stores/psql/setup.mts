import { AsyncLocalStorage } from 'node:async_hooks'
import onError from '@modules/on-error'
import {
  type BeginTransactionOptions,
  type BoundedTransactionOptions,
  type Psql,
  type Transaction,
} from '@vouchington/postgres'
import { psql } from './runtime.mts'
import { maybeCaptureQuery } from './query-capture.mts'
import type { QueryExecutor, QueryOptions, PoolClient, TransactionQuery } from './types.mts'

type AdapterTransactionOptions = Psql['withTransactionOptions']
export type OwnedTransaction = Transaction

type PostCommitAction = () => Promise<void>
type PostRollbackAction = () => Promise<void>
type PostCommitActionScope = {
  owner: QueryExecutor
  actions: PostCommitAction[]
  parent?: PostCommitActionScope
}

const postCommitActions = new WeakMap<QueryExecutor, PostCommitAction[]>()
const postRollbackActions = new WeakMap<QueryExecutor, PostRollbackAction[]>()
const postCommitActionOwners = new WeakMap<QueryExecutor, QueryExecutor>()
const postCommitActionOwnersByClient = new WeakMap<PoolClient, QueryExecutor>()
const postCommitActionScopes = new AsyncLocalStorage<PostCommitActionScope>()
const captureAwareQueries = new WeakSet<QueryExecutor>()

const runWithTransactionOptions = psql.withTransactionOptions as AdapterTransactionOptions

export async function beginTransaction(
  options: BeginTransactionOptions = {},
): Promise<OwnedTransaction> {
  return ownTransaction(await psql.beginTransaction(options))
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

/** Runs only after the owning transaction has durably rolled back.  Use this for compensating an
 * external pre-commit effect; it must re-read authoritative state rather than replay a snapshot. */
export function registerPostRollbackAction(query: QueryExecutor, action: PostRollbackAction): void {
  const owner = postCommitActionOwners.get(query) ?? postCommitActionScopes.getStore()?.owner
  if (!owner) {
    throw new Error(
      'Post-rollback actions require a transaction query owned by @data-stores/psql wrappers',
    )
  }
  const actions = postRollbackActions.get(owner) ?? []
  actions.push(action)
  postRollbackActions.set(owner, actions)
}
export async function withTransactionOptions<Result>(
  options: QueryOptions,
  handler: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const owner = options.query
    ? postCommitActionOwners.get(options.query)
    : isPoolClient(options.client)
      ? postCommitActionOwnersByClient.get(options.client)
      : undefined
  const parentScope = postCommitActionScopes.getStore()
  const scope: PostCommitActionScope | undefined = owner
    ? { owner, actions: [], parent: parentScope?.owner === owner ? parentScope : undefined }
    : undefined
  const result = await runWithTransactionOptions(options, async query => {
    const captureAwareQuery = captureQuery(query)
    return scope
      ? postCommitActionScopes.run(scope, () => handler(captureAwareQuery))
      : handler(captureAwareQuery)
  })
  if (scope) commitPostCommitActionScope(scope)
  return result
}
async function runPostCommitActions(query: QueryExecutor): Promise<void> {
  const actions = postCommitActions.get(query)
  postCommitActions.delete(query)
  if (!actions) return
  const results = await Promise.allSettled(actions.map(action => action()))
  for (const result of results) {
    if (result.status === 'rejected')
      onError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
  }
}
async function runPostRollbackActions(query: QueryExecutor): Promise<void> {
  const actions = postRollbackActions.get(query)
  postRollbackActions.delete(query)
  if (!actions) return
  const results = await Promise.allSettled(actions.map(action => action()))
  for (const result of results) {
    if (result.status === 'rejected')
      onError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
  }
}

function ownTransaction(transaction: OwnedTransaction): OwnedTransaction {
  const ownedTransaction = captureQuery(transaction)
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
    postRollbackActions.delete(ownedTransaction)
    postCommitActionOwners.delete(ownedTransaction)
    detachClientOwnership()
  }

  let committed = false
  Object.assign(ownedTransaction, {
    commit: async () => {
      detachClientOwnership()
      try {
        await commit()
        committed = true
        await runPostCommitActions(ownedTransaction)
      } finally {
        clearOwnership()
      }
    },
    rollback: async () => {
      detachClientOwnership()
      try {
        await rollback()
        await runPostRollbackActions(ownedTransaction)
      } finally {
        clearOwnership()
      }
    },
    [Symbol.asyncDispose]: async () => {
      detachClientOwnership()
      try {
        await dispose()
        if (!committed) await runPostRollbackActions(ownedTransaction)
      } finally {
        clearOwnership()
      }
    },
  })

  return ownedTransaction
}

function captureQuery<Query extends QueryExecutor>(query: Query): Query {
  if (captureAwareQueries.has(query)) return query
  const captureAwareQuery = new Proxy(query, {
    apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
      maybeCaptureQuery(argumentsList[0], argumentsList[1])
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  }) as Query
  captureAwareQueries.add(captureAwareQuery)
  return captureAwareQuery
}

function commitPostCommitActionScope(scope: PostCommitActionScope): void {
  const actions = scope.parent?.actions ?? postCommitActions.get(scope.owner) ?? []
  actions.push(...scope.actions)
  if (!scope.parent) postCommitActions.set(scope.owner, actions)
}
function isPoolClient(client: QueryOptions['client']): client is PoolClient {
  return Boolean(client && 'release' in client)
}
export * from './runtime.mts'
