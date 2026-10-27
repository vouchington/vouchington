import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  writePool,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { EntityRelationElectionTarget } from '../queues/vote-aggregation/enqueues/types-elections.mts'
import { entityRelationElectionTables } from '../services/elections-votes/entity-relation/target.mts'
import { postPublicationScopeLockKey } from '../services/post-publication/lock.mts'
import type { PostPublicationScope } from '../services/post-publication/types.mts'
import { observeTestTransactionLockNotice } from './postgres-advisory-lock-notice.mts'

/** Observe the actual updater blocked by our relation row, then inspect its own publication lock. */
export async function observeTestEntityRelationVoteStatsLock<Result>(
  target: EntityRelationElectionTarget,
  scope: PostPublicationScope,
  update: (query: TransactionQuery) => Promise<Result>,
): Promise<{ result: Result; publicationLockHeld: boolean }> {
  await using holder = await beginTransaction()
  const table = assertWhitelistedSqlIdentifier(
    target.relationTable,
    entityRelationElectionTables,
    'entityRelationTable',
  )
  const { rows: holders } = await holder<{ transaction_id: string; process_id: number }>(
    sql`/* lockTestEntityRelationVoteStatsRow */
      SELECT pg_current_xact_id()::text AS transaction_id, pg_backend_pid()::integer AS process_id
      FROM `
      .append(table)
      .append(sql` WHERE id = ${target.entityRelationId} FOR UPDATE`),
  )
  const identity = holders[0]
  if (!identity) throw new Error('Expected the owned election relation row')
  const client = await writePool.connect()
  const observer = observeTestTransactionLockNotice(client, identity.transaction_id)
  let released: Promise<void> | undefined
  const release = () => (released ??= holder.commit())
  let pending: Promise<Result> | undefined
  let outcome: { result: Result; publicationLockHeld: boolean } | undefined
  const errors: unknown[] = []
  try {
    const contender = await observer.ready
    await using query = await beginTransaction({ client })
    pending = update(query)
    const settled = Promise.allSettled([pending])
    let publicationLockHeld = false
    try {
      await observer.wait(settled)
      const { rows } = await holder<{ waiting: boolean; publication_lock_held: boolean }>(
        sql`/* inspectTestEntityRelationVoteStatsLocks */
          SELECT EXISTS (
            SELECT 1 FROM pg_locks queued
            WHERE queued.pid = ${contender.processId} AND queued.locktype = 'transactionid'
              AND queued.transactionid::text = ${identity.transaction_id}
              AND queued.mode = 'ShareLock' AND NOT queued.granted
              AND ${identity.process_id} = ANY(pg_blocking_pids(queued.pid))
          ) AS waiting, EXISTS (
            SELECT 1 FROM pg_locks held
            WHERE held.pid = ${contender.processId} AND held.locktype = 'advisory'
              AND held.granted AND held.mode = 'ExclusiveLock' AND held.objsubid = 1
              AND held.classid::bigint = ((hashtextextended(${postPublicationScopeLockKey(scope)}, 0) >> 32) & 4294967295)
              AND held.objid::bigint = (hashtextextended(${postPublicationScopeLockKey(scope)}, 0) & 4294967295)
          ) AS publication_lock_held`,
      )
      if (!rows[0]?.waiting)
        throw new Error('Election updater did not retain the exact owned relation row blocker')
      publicationLockHeld = rows[0].publication_lock_held
    } finally {
      // Release before draining or disposing the contender: its query is still blocked here.
      try {
        await release()
      } catch (err) {
        errors.push(err)
      }
      await settled
    }
    const result = await pending
    await query.commit()
    outcome = { result, publicationLockHeld }
  } catch (err) {
    errors.push(err)
  } finally {
    try {
      await release()
    } catch (err) {
      errors.push(err)
    }
    if (pending) {
      const [result] = await Promise.allSettled([pending])
      if (result?.status === 'rejected') errors.push(result.reason)
    }
    let destroy = false
    try {
      await observer.close()
    } catch (err) {
      destroy = true
      errors.push(err)
    } finally {
      client.release(destroy)
    }
  }
  if (errors.length > 0)
    throw new AggregateError([...new Set(errors)], 'Election publication lock proof failed')
  if (!outcome) throw new Error('Election publication lock proof did not finish')
  return outcome
}
