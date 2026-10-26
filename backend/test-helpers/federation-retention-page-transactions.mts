import { beginTransaction } from '@data-stores/psql'
import { cleanupActivityPubReplayPages } from '../services/data-retention/cleanup-activitypub-replay.mts'
import { scopeFederationRetentionQueryForTest } from './federation-retention-scopes.mts'
import { isReplayFloorLockedForTest } from './federation-retention-replay.mts'

type PageOwner = { pid: number; xid: string }

async function ownsTransactionLock(owner: PageOwner): Promise<boolean> {
  await using probe = await beginTransaction()
  const { rows } = await probe<{ held: boolean }>(
    `/* hasOwnedReplayPageTransactionLockForTest */
     SELECT EXISTS (
       SELECT 1 FROM pg_locks WHERE pid = $1 AND transactionid::text = $2
         AND locktype = 'transactionid' AND mode = 'ExclusiveLock' AND granted
     ) AS held`,
    [owner.pid, owner.xid],
  )
  return rows[0]?.held ?? false
}

/** Exercise the production transaction loop against only committed, caller-owned replay IDs. */
export async function cleanupCommittedReplayPagesForTest(ids: readonly string[]) {
  const lockDuringPage: boolean[] = []
  const previousPageTransactionActive: boolean[] = []
  const pageTransactionActive: boolean[] = []
  const owners: PageOwner[] = []
  let pageCount = 0
  const openTransaction: typeof beginTransaction = async options => {
    const previous = owners.at(-1)
    previousPageTransactionActive.push(previous ? await ownsTransactionLock(previous) : false)
    const transaction = await beginTransaction(options)
    const scoped = scopeFederationRetentionQueryForTest(transaction, 'outbound', ids)
    return new Proxy(transaction, {
      async apply(_target, thisArgument, args: Parameters<typeof transaction>) {
        const result = await Reflect.apply(scoped, thisArgument, args)
        const statement = typeof args[0] === 'string' ? args[0] : args[0].text
        if (statement.includes('/* listActivityPubReplayRetentionCandidates */')) {
          const { rows } = await transaction<PageOwner>(
            `/* readOwnedReplayPageTransactionLockForTest */
             SELECT pid, transactionid::text AS xid FROM pg_locks
             WHERE pid = pg_backend_pid() AND locktype = 'transactionid'
               AND mode = 'ExclusiveLock' AND granted`,
          )
          if (rows.length !== 1) throw new Error('Expected exactly one owned page transaction lock')
          const owner = rows[0]!
          owners.push(owner)
          pageCount += 1
          pageTransactionActive.push(await ownsTransactionLock(owner))
          // Smoke check only: the lifetime proof above is scoped to this exact page owner.
          lockDuringPage.push(await isReplayFloorLockedForTest('outbound'))
        }
        return result
      },
    })
  }
  const result = await cleanupActivityPubReplayPages(
    'outbound',
    { batchSize: 1, maxBatches: 2, now: new Date() },
    openTransaction,
  )
  return { result, pageCount, previousPageTransactionActive, pageTransactionActive, lockDuringPage }
}
