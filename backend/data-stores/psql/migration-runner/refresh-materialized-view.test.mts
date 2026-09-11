import type pg from 'pg'
import { describe, expect, it } from 'vitest'

import { writePool } from '../setup.mts'
import type { PoolClient } from '../types.mts'
import { refreshMaterializedView } from './refresh-materialized-view.mts'

const originalWritePoolConnect = writePool.connect

describe('refreshMaterializedView', () => {
  it('refreshes an allowlisted materialized view', async () => {
    await expect(refreshMaterializedView('mv_rss_feed_crawl_tiers')).resolves.toBeUndefined()
  })

  it('refreshes the top-hashtags view through its serialized refresh path', async () => {
    await expect(refreshMaterializedView('mv_top_hashtags')).resolves.toBeUndefined()
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
    if (fault.refreshError && String(input).includes('/* refreshMaterializedView */')) {
      return Promise.reject(fault.refreshError)
    }
    if (String(input).includes('refreshMaterializedView.unlock')) {
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
