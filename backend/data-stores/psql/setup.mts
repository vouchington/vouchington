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
type PostCommitActionScope = {
  owner: QueryExecutor
  actions: PostCommitAction[]
  parent?: PostCommitActionScope
}

const postCommitActions = new WeakMap<QueryExecutor, PostCommitAction[]>()
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
export async function withTransactionOptions<Result>(
  options: QueryOptions,
  handler: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const activeClient =
    !options.query && isPoolClient(options.client) && (await isTransactionActive(options.client))
  if (options.query || activeClient) {
    const owner = options.query
      ? postCommitActionOwners.get(options.query)
      : postCommitActionOwnersByClient.get(options.client as PoolClient)
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
  return runWithTransactionOptions(options, query => handler(captureQuery(query)))
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

function ownTransaction(transaction: OwnedTransaction): OwnedTransaction {
  const ownedTransaction = captureQuery(transaction)
  postCommitActionOwners.set(ownedTransaction, ownedTransaction)
  postCommitActionOwnersByClient.set(ownedTransaction.client, ownedTransaction)

  const commit = transaction.commit
  const rollback = transaction.rollback
  const dispose = transaction[Symbol.asyncDispose]
  const clearOwnership = () => {
    postCommitActions.delete(ownedTransaction)
    postCommitActionOwners.delete(ownedTransaction)
    if (postCommitActionOwnersByClient.get(ownedTransaction.client) === ownedTransaction)
      postCommitActionOwnersByClient.delete(ownedTransaction.client)
  }

  Object.assign(ownedTransaction, {
    commit: async () => {
      try {
        await commit()
        await runPostCommitActions(ownedTransaction)
      } finally {
        clearOwnership()
      }
    },
    rollback: async () => {
      try {
        await rollback()
      } finally {
        clearOwnership()
      }
    },
    [Symbol.asyncDispose]: async () => {
      try {
        await dispose()
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
async function isTransactionActive(client: PoolClient): Promise<boolean> {
  try {
    await client.query('/* isTransactionActive */ SAVEPOINT psql_post_commit_action_probe')
    await client.query('/* isTransactionActive */ RELEASE SAVEPOINT psql_post_commit_action_probe')
    return true
  } catch (error) {
    if ((error as { code?: string }).code === '25P01') return false
    throw error
  }
}
export * from './runtime.mts'
