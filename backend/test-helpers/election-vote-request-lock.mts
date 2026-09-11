import type pg from 'pg'
import { advisoryLockPool, type PoolClient } from '@data-stores/psql'

const originalAdvisoryLockConnect = advisoryLockPool.connect

export function injectTestElectionVoteRequestUnlockFault(
  fault: { unlockError: Error } | { unlocked: false },
): { releasedWith(): Error | boolean | undefined; restore(): void } {
  let releaseValue: Error | boolean | undefined
  const patchedConnect = connectWithRequestUnlockFault as typeof advisoryLockPool.connect

  async function connectWithRequestUnlockFault(): Promise<PoolClient> {
    const client = await Reflect.apply(originalAdvisoryLockConnect, advisoryLockPool, [])
    wrapRequestUnlock(client, fault, value => {
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

function wrapRequestUnlock(
  client: PoolClient,
  fault: { unlockError: Error } | { unlocked: false },
  onRelease: (value: Error | boolean | undefined) => void,
): void {
  const query = client.query
  const release = client.release
  client.query = ((input: unknown, values?: unknown[]) => {
    if (String(input).includes('unlockElectionVoteRequest')) {
      if ('unlockError' in fault) return Promise.reject(fault.unlockError)
      return Promise.resolve({ rows: [{ unlocked: false }] })
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
