import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { cleanupActivityPubReplayPages } from '../services/data-retention/cleanup-activitypub-replay.mts'
import { scopeFederationRetentionQueryForTest } from './federation-retention-scopes.mts'

async function readRemainingReplayIds(query: TransactionQuery, ids: readonly string[]) {
  const { rows } = await query<{ id: string }>(
    `/* readRemainingReplayIdsForTest */
     SELECT id FROM activitypub_inbox_activities WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [ids],
  )
  return rows.map(row => row.id)
}

/** Observe the committed ledger from each new page transaction. */
export async function cleanupCommittedReplayPagesForTest(ids: readonly string[]) {
  const remainingAtPageStart: string[][] = []
  const openTransaction: typeof beginTransaction = async options => {
    const transaction = await beginTransaction(options)
    try {
      remainingAtPageStart.push(await readRemainingReplayIds(transaction, ids))
      return scopeFederationRetentionQueryForTest(transaction, 'inbox', ids)
    } catch (err) {
      await transaction[Symbol.asyncDispose]()
      throw err
    }
  }
  const result = await cleanupActivityPubReplayPages(
    { batchSize: 1, maxBatches: 2, now: new Date() },
    openTransaction,
  )
  await using observer = await beginTransaction()
  const remainingAfterCleanup = await readRemainingReplayIds(observer, ids)
  return { result, remainingAtPageStart, remainingAfterCleanup }
}
