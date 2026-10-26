import { beginTransaction } from '@data-stores/psql'
import { cleanupActivityPubReplayPages } from '../services/data-retention/cleanup-activitypub-replay.mts'
import { scopeFederationRetentionQueryForTest } from './federation-retention-scopes.mts'
import { isReplayFloorLockedForTest } from './federation-retention-replay.mts'

/** Exercise the production transaction loop against only committed, caller-owned replay IDs. */
export async function cleanupCommittedReplayPagesForTest(ids: readonly string[]) {
  const lockDuringPage: boolean[] = []
  const lockBeforePage: boolean[] = []
  let pageCount = 0
  const openTransaction: typeof beginTransaction = async options => {
    lockBeforePage.push(await isReplayFloorLockedForTest('outbound'))
    const transaction = await beginTransaction(options)
    const scoped = scopeFederationRetentionQueryForTest(transaction, 'outbound', ids)
    return new Proxy(transaction, {
      async apply(_target, thisArgument, args: Parameters<typeof transaction>) {
        const result = await Reflect.apply(scoped, thisArgument, args)
        const statement = typeof args[0] === 'string' ? args[0] : args[0].text
        if (statement.includes('/* listActivityPubReplayRetentionCandidates */')) {
          pageCount += 1
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
  return { result, pageCount, lockBeforePage, lockDuringPage }
}
