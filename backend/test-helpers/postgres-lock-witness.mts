import { writePool, type PoolClient } from '@data-stores/psql'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'
import { getTestOwnedPostgresLock } from './postgres-client-lock-identity.mts'

/** Keep a real waiter queued until the witness assertions explicitly release its holder. */
export async function withTestPostgresLockWitness(
  action: (input: {
    observer: PoolClient
    waiterProcessId: number
    holderProcessId: number
    queryMarker: string
    releaseHolder: () => Promise<void>
  }) => Promise<void>,
): Promise<void> {
  const clients: PoolClient[] = []
  const key = crypto.randomUUID()
  let operation: Promise<unknown> | undefined
  let notice: ReturnType<typeof observeTestAdvisoryLockNotice> | undefined
  let release: Promise<void> | undefined
  try {
    for (let index = 0; index < 3; index++) clients.push(await writePool.connect())
    const [holder, waiter, observer] = clients
    if (!holder || !waiter || !observer) throw new Error('Missing owned witness connection')
    const { rows } = await holder.query<{ process_id: number }>(
      `/* withTestPostgresLockWitness.hold */
      SELECT pg_advisory_lock(hashtextextended($1, 0)), pg_backend_pid() AS process_id`,
      [key],
    )
    const holderProcessId = rows[0]!.process_id
    const lock = await getTestOwnedPostgresLock(observer, {
      holderProcessId,
      lock: { kind: 'advisory', key },
    })
    if (lock.kind !== 'advisory') throw new Error('Expected owned advisory lock')
    notice = observeTestAdvisoryLockNotice(waiter, lock.tag)
    const { processId: waiterProcessId } = await notice.ready
    const queryMarker = 'withTestPostgresLockWitness.wait'
    operation = waiter.query(
      `/* withTestPostgresLockWitness.wait */ SELECT pg_advisory_lock(hashtextextended($1, 0))`,
      [key],
    )
    const outcome = Promise.allSettled([operation])
    await notice.wait(outcome)
    const releaseHolder = () =>
      (release ??= (async () => {
        await holder.query(
          `/* withTestPostgresLockWitness.release */
          SELECT pg_advisory_unlock(hashtextextended($1, 0))`,
          [key],
        )
        await operation
      })())
    await action({ observer, waiterProcessId, holderProcessId, queryMarker, releaseHolder })
  } finally {
    // Discarding the holder also releases its session lock on an assertion/setup failure.
    clients[0]?.release(true)
    await Promise.allSettled([operation])
    try {
      await notice?.close()
    } finally {
      for (const client of clients.slice(1)) client.release(true)
    }
  }
}
