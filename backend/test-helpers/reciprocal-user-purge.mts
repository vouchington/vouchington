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
type BeforeQuery = (query: QueryExecutor, text: string, values: readonly unknown[]) => Promise<void>

function observePurgeTransaction(
  transaction: OwnedTransaction,
  failures: PurgeFailure[],
  before?: BeforeQuery,
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
  return new Proxy(transaction, {
    get(target, property, receiver) {
      return property === 'commit' ? observedCommit : Reflect.get(target, property, receiver)
    },
    async apply(target, receiver, args: Parameters<QueryExecutor>) {
      const [statement, parameters] = args
      const text = typeof statement === 'string' ? statement : statement.text
      const values = typeof statement === 'string' ? (parameters ?? []) : statement.values
      if (text.includes('cleanupSoftDeletedUserBatch: check target')) userId = String(values[0])
      await before?.(target, text, values)
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

/** Pin one actor's SSI snapshot before table reads, then settle its real competitor. */
export async function purgeAfterTestVictimSnapshot<Result, Winner>(
  victimId: string,
  operation: () => Promise<Result>,
  winner: () => Promise<Winner>,
): Promise<{
  victim: PromiseSettledResult<Result>
  winner: PromiseSettledResult<Winner> | undefined
  failures: PurgeFailure[]
}> {
  let competing: PromiseSettledResult<Winner> | undefined
  let applied = false
  const failures: PurgeFailure[] = []
  const restore = interceptPostgresTransactionsForTest(transaction =>
    observePurgeTransaction(transaction, failures, async (query, text, values) => {
      if (
        !applied &&
        text.includes('cleanupSoftDeletedUserBatch: check target') &&
        values.includes(victimId)
      ) {
        applied = true
        await query('/* pinTestVictimPurgeSnapshot */ SELECT pg_current_snapshot()')
        ;[competing] = await Promise.allSettled([winner()])
      }
    }),
  )
  try {
    const [victim] = await Promise.allSettled([operation()])
    return { victim: victim!, winner: competing, failures }
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
