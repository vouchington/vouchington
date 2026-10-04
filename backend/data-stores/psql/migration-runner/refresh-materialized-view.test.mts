import { scheduler } from 'node:timers/promises'
import type pg from 'pg'
import { describe, expect, it } from 'vitest'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'

import { writePool } from '../setup.mts'
import type { PoolClient } from '../types.mts'
import { refreshMaterializedView } from './refresh-materialized-view.mts'

const REFRESH_LOCK_KEY = 'refresh-materialized-view'
const REFRESH_CONTENTION_MESSAGE = 'Materialized view refresh contention; retryable'

const originalWritePoolConnect = writePool.connect

describe('refreshMaterializedView', () => {
  it('refreshes an allowlisted materialized view after another session releases the shared lock', async () => {
    const holder = await writePool.connect()
    let outcome: Promise<'fulfilled' | 'rejected'> | undefined
    try {
      await holdRefreshLock(holder)
      await expect(refreshMaterializedView('mv_rss_feed_crawl_tiers')).rejects.toThrow(
        REFRESH_CONTENTION_MESSAGE,
      )
      outcome = refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers').then(
        () => 'fulfilled' as const,
        () => 'rejected' as const,
      )
      const early = await Promise.race([outcome, scheduler.wait(80).then(() => 'pending' as const)])
      expect(early).toBe('pending')
      await releaseRefreshLock(holder)
      expect(await outcome).toBe('fulfilled')
    } finally {
      try {
        await releaseRefreshLock(holder)
      } finally {
        if (outcome) await outcome
        holder.release()
      }
    }
  })

  it('refreshes the top-hashtags view through its serialized refresh path', async () => {
    await expect(refreshMaterializedViewForTest('mv_top_hashtags')).resolves.toBeUndefined()
  })

  it('rejects a view that is not on the allowlist', async () => {
    await expect(refreshMaterializedView('pg_class')).rejects.toThrow(
      'Materialized view is not refreshable: pg_class',
    )
  })

  it('returns a healthy client to the pool when the advisory lock is contended', async () => {
    const injectedContention = injectRefreshMaterializedViewContention()
    try {
      await expect(refreshMaterializedView('mv_top_hashtags')).rejects.toThrow(
        'Materialized view refresh contention; retryable',
      )
      expect(injectedContention.releasedWith()).toBeUndefined()
    } finally {
      injectedContention.restore()
    }
  })

  it('destroys the client when releasing the advisory lock fails', async () => {
    const unlockError = new Error('unlock failed')
    const injectedFault = injectRefreshMaterializedViewFault({ unlockError })
    try {
      await expect(refreshMaterializedView('mv_top_hashtags')).rejects.toBe(unlockError)
      expect(injectedFault.releasedWith()).toBe(unlockError)
    } finally {
      injectedFault.restore()
    }
  })

  it('keeps the refresh error primary when releasing the advisory lock also fails', async () => {
    const refreshError = new Error('refresh failed')
    const unlockError = new Error('unlock failed')
    const injectedFault = injectRefreshMaterializedViewFault({ refreshError, unlockError })
    try {
      await expect(refreshMaterializedView('mv_top_hashtags')).rejects.toBe(refreshError)
      expect(injectedFault.releasedWith()).toBe(unlockError)
    } finally {
      injectedFault.restore()
    }
  })
})

async function holdRefreshLock(holder: PoolClient): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const locked = await holder.query<{ locked: boolean }>(
      '/* refreshMaterializedViewTest.holdLock */ SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [REFRESH_LOCK_KEY],
    )
    if (locked.rows[0]?.locked) return
    await scheduler.wait(50)
  }
  throw new Error('timed out acquiring the materialized-view refresh lock')
}

async function releaseRefreshLock(holder: PoolClient): Promise<void> {
  await holder.query(
    '/* refreshMaterializedViewTest.releaseLock */ SELECT pg_advisory_unlock(hashtext($1))',
    [REFRESH_LOCK_KEY],
  )
}

function injectRefreshMaterializedViewContention(): {
  releasedWith(): Error | boolean | undefined
  restore(): void
} {
  let releaseValue: Error | boolean | undefined
  const patchedConnect = connectWithInjectedContention as typeof writePool.connect

  async function connectWithInjectedContention(): Promise<PoolClient> {
    const client = await Reflect.apply(originalWritePoolConnect, writePool, [])
    const query = client.query
    const release = client.release
    client.query = ((input: unknown, values?: unknown[]) => {
      if (String(input).includes('refreshMaterializedView.tryAdvisoryLock')) {
        return Promise.resolve({ rows: [{ locked: false }] } as pg.QueryResult)
      }
      return Reflect.apply(query, client, [input, values]) as Promise<pg.QueryResult>
    }) as PoolClient['query']
    client.release = (value?: Error | boolean) => {
      releaseValue = value
      client.query = query
      client.release = release
      Reflect.apply(release, client, [value])
    }
    return client
  }
  writePool.connect = patchedConnect

  return {
    releasedWith: () => releaseValue,
    restore() {
      if (writePool.connect === patchedConnect) writePool.connect = originalWritePoolConnect
    },
  }
}

function injectRefreshMaterializedViewFault({
  refreshError,
  unlockError,
}: {
  refreshError?: Error
  unlockError: Error
}): {
  releasedWith(): Error | boolean | undefined
  restore(): void
} {
  let releaseValue: Error | boolean | undefined
  const patchedConnect = connectWithInjectedFault as typeof writePool.connect

  async function connectWithInjectedFault(): Promise<PoolClient> {
    const client = await Reflect.apply(originalWritePoolConnect, writePool, [])
    wrapRefreshMaterializedViewFault(client, { refreshError, unlockError }, value => {
      releaseValue = value
    })
    return client
  }
  writePool.connect = patchedConnect

  return {
    releasedWith: () => releaseValue,
    restore() {
      if (writePool.connect === patchedConnect) {
        writePool.connect = originalWritePoolConnect
      }
    },
  }
}

function wrapRefreshMaterializedViewFault(
  client: PoolClient,
  fault: { refreshError?: Error; unlockError: Error },
  onRelease: (value: Error | boolean | undefined) => void,
): void {
  const query = client.query
  const release = client.release
  client.query = ((input: unknown, values?: unknown[]) => {
    const sql = String(input)
    // Parallel files share `refresh-materialized-view`. These cases assert client destruction,
    // not the real lock or refresh, so a concurrent REFRESH must not surface as contention.
    if (sql.includes('refreshMaterializedView.tryAdvisoryLock')) {
      return Promise.resolve({ rows: [{ locked: true }] } as pg.QueryResult)
    }
    if (sql.includes('/* refreshMaterializedView */')) {
      if (fault.refreshError) return Promise.reject(fault.refreshError)
      return Promise.resolve({ rows: [] } as pg.QueryResult)
    }
    if (sql.includes('refreshMaterializedView.unlock')) {
      return Promise.reject(fault.unlockError)
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
