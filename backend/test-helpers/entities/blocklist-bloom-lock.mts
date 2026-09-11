import type pg from 'pg'

import { advisoryLockPool, writePool, type PoolClient } from '@data-stores/psql'

const originalAdvisoryLockConnect = advisoryLockPool.connect

export async function createTestBlocklistBloomLockProbe(
  lockNamespace: number,
  filterName: 'url-blocklist' | 'email-blocklist',
): Promise<{
  tryAcquire(): Promise<boolean>
  release(): Promise<void>
}> {
  const client = await writePool.connect()
  let acquired = false
  let released = false
  return {
    async tryAcquire() {
      if (released) throw new Error('Blocklist Bloom lock probe was already released')
      if (acquired) throw new Error('Blocklist Bloom lock probe already holds the lock')
      const result = await client.query<{ acquired: boolean }>(
        "/* testBlocklistBloomLockProbe:tryAcquire */ SELECT pg_try_advisory_lock($1, hashtext(current_database() || ':' || $2)) AS acquired",
        [lockNamespace, filterName],
      )
      acquired = result.rows[0]?.acquired ?? false
      return acquired
    },
    async release() {
      if (released) return
      released = true
      try {
        if (acquired) {
          const result = await client.query<{ unlocked: boolean }>(
            "/* testBlocklistBloomLockProbe:release */ SELECT pg_advisory_unlock($1, hashtext(current_database() || ':' || $2)) AS unlocked",
            [lockNamespace, filterName],
          )
          if (!result.rows[0]?.unlocked) {
            throw new Error('Blocklist Bloom test lock was not held at release')
          }
        }
        client.release()
      } catch (error) {
        client.release(true)
        throw error
      }
    },
  }
}

export interface TestBlocklistBloomUnlockFault {
  releasedWith(): Error | boolean | undefined
  restore(): void
}

export function injectTestBlocklistBloomUnlockFault(
  fault: { unlockError: Error } | { unlocked: false },
): TestBlocklistBloomUnlockFault {
  let releaseValue: Error | boolean | undefined
  const patchedConnect = connectWithBlocklistBloomUnlockFault as typeof advisoryLockPool.connect

  async function connectWithBlocklistBloomUnlockFault(): Promise<PoolClient> {
    const client = await Reflect.apply(originalAdvisoryLockConnect, advisoryLockPool, [])
    wrapBlocklistBloomUnlock(client, fault, value => {
      releaseValue = value
    })
    return client
  }
  advisoryLockPool.connect = patchedConnect
  return {
    releasedWith: () => releaseValue,
    restore() {
      if (advisoryLockPool.connect === patchedConnect) {
        advisoryLockPool.connect = originalAdvisoryLockConnect
      }
    },
  }
}

function wrapBlocklistBloomUnlock(
  client: PoolClient,
  fault: { unlockError: Error } | { unlocked: false },
  onRelease: (value: Error | boolean | undefined) => void,
): void {
  const query = client.query
  const release = client.release

  client.query = ((input: unknown, values?: unknown[]) => {
    if (String(input).includes('withBlocklistBloomFilterLock:unlock')) {
      if ('unlockError' in fault) return Promise.reject(fault.unlockError)
      return Promise.resolve({ rows: [{ unlocked: fault.unlocked }] })
    }
    return Reflect.apply(query, client, [input, values]) as Promise<pg.QueryResult>
  }) as PoolClient['query']
  client.release = (value?: Error | boolean) => {
    onRelease(value)
    client.query = query
    client.release = release
    Reflect.apply(release, client, [value])
  }
}
