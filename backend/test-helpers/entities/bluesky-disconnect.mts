import type pg from 'pg'

import { advisoryLockPool, write, writePool, type PoolClient } from '@data-stores/psql'
import sql from 'sql-template-strings'

const originalAdvisoryLockConnect = advisoryLockPool.connect

export async function requestTestBlueskyDisconnect(did: string): Promise<void> {
  await write(sql`/* requestTestBlueskyDisconnect */
    UPDATE bluesky_linked_accounts
    SET disconnect_requested_at = CURRENT_TIMESTAMP
    WHERE bluesky_did = ${did}`)
}

export async function createTestBlueskyDisconnectLockProbe(
  lockNamespace: number,
  userId: string,
): Promise<{
  tryAcquire(): Promise<boolean>
  release(): Promise<void>
}> {
  const client = await writePool.connect()
  let acquired = false
  let released = false
  return {
    async tryAcquire() {
      if (released) throw new Error('Bluesky disconnect lock probe was already released')
      if (acquired) throw new Error('Bluesky disconnect lock probe already holds the lock')
      const result = await client.query<{ acquired: boolean }>(
        '/* testBlueskyDisconnectLockProbe:tryAcquire */ SELECT pg_try_advisory_lock($1, hashtext($2)) AS acquired',
        [lockNamespace, userId],
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
            '/* testBlueskyDisconnectLockProbe:release */ SELECT pg_advisory_unlock($1, hashtext($2)) AS unlocked',
            [lockNamespace, userId],
          )
          if (!result.rows[0]?.unlocked) {
            throw new Error('Bluesky disconnect test lock was not held at release')
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

export interface TestBlueskyDisconnectUnlockFault {
  releasedWith(): Error | boolean | undefined
  restore(): void
}

export function injectTestBlueskyDisconnectUnlockFault(
  fault: { unlockError: Error } | { unlocked: false },
): TestBlueskyDisconnectUnlockFault {
  let releaseValue: Error | boolean | undefined
  const patchedConnect = connectWithDisconnectUnlockFault as typeof advisoryLockPool.connect

  async function connectWithDisconnectUnlockFault(): Promise<PoolClient> {
    const client = await Reflect.apply(originalAdvisoryLockConnect, advisoryLockPool, [])
    wrapDisconnectUnlock(client, fault, value => {
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

function wrapDisconnectUnlock(
  client: PoolClient,
  fault: { unlockError: Error } | { unlocked: false },
  onRelease: (value: Error | boolean | undefined) => void,
): void {
  const query = client.query
  const release = client.release

  client.query = ((input: unknown, values?: unknown[]) => {
    if (String(input).includes('withBlueskyDisconnectLock:unlock')) {
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
