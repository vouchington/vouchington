import assert from 'node:assert/strict'
import type { Psql } from '@vouchington/postgres'

type ObservedClient = Pick<
  Parameters<Parameters<Psql['withMigrationSession']>[0]>[0],
  'on' | 'once' | 'off'
>

/** Operations must settle before close; pool.end is never used to cancel a checkout. */
export function observeMigrationPools(platform: Psql) {
  const pools = [platform.writePool, platform.readPool, platform.advisoryLockPool]
  const clients = new Map<ObservedClient, Promise<void>>()
  const errors: unknown[] = []
  const observe = (client: ObservedClient) => {
    if (clients.has(client)) return
    const ended = Promise.withResolvers<void>()
    clients.set(client, ended.promise)
    client.on('error', recordError)
    client.once('end', ended.resolve)
  }
  function recordError(error: unknown) {
    errors.push(error)
  }
  for (const pool of pools) {
    pool.on('error', recordError)
    pool.on('connect', observe)
    pool.on('acquire', observe)
    assert.ok((pool.options.max ?? 0) > 2, 'Two operations must fit below the public pool maximum')
  }
  return async () => {
    for (const pool of pools) assert.equal(pool.waitingCount, 0, 'Unsettled checkout queue')
    // Prime/release also observes any startup connection retained before the observer attached.
    const primed = await Promise.allSettled(
      pools.map(async pool => {
        const client = await pool.connect()
        client.release()
      }),
    )
    for (const result of primed) if (result.status === 'rejected') errors.push(result.reason)
    for (const pool of pools)
      assert.equal(pool.waitingCount, 0, 'Checkout did not settle before pool close')
    const results = await Promise.allSettled(
      pools.map(pool => Promise.resolve().then(() => pool.end())),
    )
    for (const result of results) if (result.status === 'rejected') errors.push(result.reason)
    await Promise.all([...clients.values()])
    for (const pool of pools) {
      try {
        assert.equal(pool.waitingCount, 0)
        assert.equal(pool.totalCount, 0)
      } catch (err) {
        errors.push(err)
      }
    }
    for (const pool of pools) {
      pool.off('connect', observe)
      pool.off('acquire', observe)
      pool.off('error', recordError)
    }
    for (const client of clients.keys()) client.off('error', recordError)
    if (errors.length)
      throw new AggregateError(errors, 'Migration pool closure failed', { cause: errors[0] })
    return clients.size
  }
}
