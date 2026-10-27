import {
  beginTransaction,
  writePool,
  type OwnedTransaction,
  type PoolClient,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { onTestFinished } from 'vitest'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'

/** Exercise the actual canonical batch conflict on two real transactions. */
export async function runTestClassifierBatchConflict(
  batchId: string,
  firstAction: (query: OwnedTransaction) => Promise<boolean>,
  secondAction: (query: OwnedTransaction) => Promise<boolean>,
): Promise<[boolean, boolean]> {
  await using holder = await beginTransaction()
  let borrowed: Promise<PoolClient> | undefined
  let client: PoolClient | undefined
  let observer: ReturnType<typeof observeTestAdvisoryLockNotice> | undefined
  let contender: OwnedTransaction | undefined
  let outcome: Promise<[PromiseSettledResult<boolean>]> | undefined
  let holderReleased: Promise<void> | undefined
  let cleaning: Promise<void> | undefined
  let closed = false
  let primary: { reason: unknown } | undefined
  const releaseHolder = () => (holderReleased ??= holder.commit())
  const cleanup = () => {
    closed = true
    return (cleaning ??= (async () => {
      const failures: unknown[] = []
      try {
        await releaseHolder()
      } catch (err) {
        failures.push(err)
      }
      await outcome
      if (borrowed) await Promise.allSettled([borrowed])
      try {
        await contender?.[Symbol.asyncDispose]()
      } catch (err) {
        failures.push(err)
      }
      try {
        await observer?.close()
      } catch (err) {
        failures.push(err)
      }
      if (client) {
        const reserved = client
        if (failures.length) {
          const ended = new Promise<void>(resolve => reserved.once('end', resolve))
          reserved.release(true)
          await ended
        } else reserved.release()
      }
      if (failures.length)
        throw new AggregateError(
          [...(primary ? [primary.reason] : []), ...failures],
          'Classifier batch conflict cleanup failed',
        )
    })())
  }
  onTestFinished(cleanup)
  try {
    const firstResult = await firstAction(holder)
    const key = `classifier-decision-batch:${batchId.toLowerCase()}`
    const { rows } = await holder<{ lock_tag: string }>(sql`
      /* runTestClassifierBatchConflict.identity */
      SELECT 'advisory lock [' || database::text || ',' || classid::text || ',' ||
        objid::text || ',' || objsubid::text || ']' AS lock_tag
      FROM pg_locks
      WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted
        AND mode = 'ExclusiveLock' AND objsubid = 1
        AND classid::bigint = ((hashtextextended(${key}, 0) >> 32) & 4294967295)
        AND objid::bigint = (hashtextextended(${key}, 0) & 4294967295)
      LIMIT 2
    `)
    if (rows.length !== 1 || !rows[0])
      throw new Error('Classifier holder did not acquire the exact canonical batch fence')
    if (closed) throw new Error('Classifier conflict closed before contender reservation')
    borrowed = writePool.connect().then(reserved => (client = reserved))
    const reserved = await borrowed
    if (closed) throw new Error('Classifier conflict closed before contender setup')
    observer = observeTestAdvisoryLockNotice(reserved, rows[0].lock_tag)
    await observer.ready
    outcome = Promise.allSettled([
      (async () => {
        if (closed) throw new Error('Classifier conflict closed before contender admission')
        contender = await beginTransaction({ client: reserved })
        if (closed) throw new Error('Classifier conflict closed before contender SQL')
        return secondAction(contender)
      })(),
    ] as const)
    await observer.wait(outcome)
    await releaseHolder()
    const [secondResult] = await outcome
    if (secondResult.status === 'rejected') throw secondResult.reason
    if (closed) throw new Error('Classifier conflict closed before contender commit')
    await contender?.commit()
    return [firstResult, secondResult.value]
  } catch (err) {
    primary = { reason: err }
    throw err
  } finally {
    await cleanup()
  }
}
