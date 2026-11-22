import { write, type QueryExecutor, type OwnedTransaction } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'

export async function setReciprocalTestUserDeletionActors(
  firstUserId: string,
  secondUserId: string,
  deletedAt: Date,
): Promise<void> {
  await write(
    `/* setReciprocalTestUserDeletionActors */
    UPDATE users SET deleted_at = $3,
      deleted_by_id = CASE WHEN id = $1::uuid THEN $2::uuid ELSE $1::uuid END
    WHERE id IN ($1::uuid, $2::uuid)`,
    [firstUserId, secondUserId, deletedAt],
  )
}

/** Incoming attribution remains intact until its actual target DELETE commits. */
export async function setTestUserPurgeWitness(witnessId: string, targetId: string): Promise<void> {
  await write(
    `/* setTestUserPurgeWitness */
    UPDATE users SET referrer_user_id = $2::uuid, deleted_by_id = $2::uuid WHERE id = $1::uuid`,
    [witnessId, targetId],
  )
}

export async function readTestUserPurgeReferences(userId: string): Promise<{
  referrer_user_id: string | null
  deleted_by_id: string | null
} | null> {
  const { rows } = await write<{ referrer_user_id: string | null; deleted_by_id: string | null }>(
    `/* readTestUserPurgeReferences */ SELECT referrer_user_id, deleted_by_id FROM users WHERE id=$1::uuid`,
    [userId],
  )
  return rows[0] ?? null
}

type PurgeFailure = { userId: string | undefined; error: unknown }

function observePurgeTransaction(
  transaction: OwnedTransaction,
  failures: PurgeFailure[],
): OwnedTransaction {
  let userId: string | undefined
  const commit = transaction.commit
  const observedCommit = async () => {
    try {
      await commit()
    } catch (err) {
      failures.push({ userId, error: err })
      throw err
    }
  }
  transaction.commit = observedCommit
  return new Proxy(transaction, {
    async apply(target, receiver, args: Parameters<QueryExecutor>) {
      const [statement, parameters] = args
      const text = typeof statement === 'string' ? statement : statement.text
      const values = typeof statement === 'string' ? (parameters ?? []) : statement.values
      if (text.includes('cleanupSoftDeletedUserBatch: check target')) userId = String(values[0])
      try {
        return await Reflect.apply(target, receiver, args)
      } catch (err) {
        failures.push({ userId, error: err })
        if (err instanceof Error) Object.assign(err, { testPurgeQuery: { text, values } })
        throw err
      }
    },
  })
}

/**
 * Settles both purges after each has locked its own account row, so each DELETE then needs the
 * other's locked row (the users' incoming references) and the database must break the deadlock.
 */
export async function purgeBothAfterTestUserLocks<Result>(
  ids: readonly [string, string],
  purge: (id: string) => Promise<Result>,
): Promise<PromiseSettledResult<Result>[]> {
  const arrived = ids.map(() => Promise.withResolvers<void>())
  const bothArrived = Promise.all(arrived.map(arrival => arrival.promise))
  const restore = interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, receiver, args: Parameters<QueryExecutor>) {
          const result = await Reflect.apply(target, receiver, args)
          const [statement, parameters] = args
          const text = typeof statement === 'string' ? statement : statement.text
          const values = typeof statement === 'string' ? (parameters ?? []) : statement.values
          const index = ids.indexOf(String(values[0]))
          if (text.includes('cleanupSoftDeletedUserBatch:lockUser') && index >= 0) {
            arrived[index]!.resolve()
            await bothArrived
          }
          return result
        },
      }),
  )
  try {
    return await Promise.allSettled(ids.map(purge))
  } finally {
    restore()
  }
}

/** Observe one real attempt; callers inspect its native failures without retrying it. */
export async function observeTestUserPurgeAttempt<Result>(operation: () => Promise<Result>) {
  const failures: PurgeFailure[] = []
  const restore = interceptPostgresTransactionsForTest(transaction =>
    observePurgeTransaction(transaction, failures),
  )
  try {
    return { result: await operation(), failures }
  } finally {
    restore()
  }
}

/** Accept only PostgreSQL serialization/deadlock SQLSTATE, never an HTTP status or message. */
export function testPurgeSqlState(error: unknown): unknown {
  const failure = error as { code?: unknown; cause?: { code?: unknown } } | null
  return failure?.code ?? failure?.cause?.code
}
