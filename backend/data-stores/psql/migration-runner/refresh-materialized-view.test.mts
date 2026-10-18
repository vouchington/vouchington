import { scheduler } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'

import { writePool } from '../setup.mts'
import type { PoolClient } from '../types.mts'
import { refreshMaterializedView } from './refresh-materialized-view.mts'

const REFRESH_LOCK_KEY = 'refresh-materialized-view'

describe('refreshMaterializedView', () => {
  it('refreshes an allowlisted app view after another session releases the shared lock', async () => {
    const holder = await writePool.connect()
    let outcome: Promise<'fulfilled' | 'rejected'> | undefined
    try {
      await holdRefreshLock(holder)
      await expect(refreshMaterializedView('mv_rss_feed_crawl_tiers')).rejects.toThrow(
        'Materialized view refresh contention; retryable',
      )
      const retryObserved = Promise.withResolvers<void>()
      outcome = refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers', {
        onRetryableContention: () => {
          retryObserved.resolve()
          return undefined
        },
      }).then(
        () => 'fulfilled' as const,
        () => 'rejected' as const,
      )
      expect(await Promise.race([outcome, retryObserved.promise.then(() => 'retrying')])).toBe(
        'retrying',
      )
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

  it('refreshes the top-hashtags app view', async () => {
    await expect(refreshMaterializedViewForTest('mv_top_hashtags')).resolves.toBeUndefined()
  })

  it('rejects a view outside the app allowlist', async () => {
    await expect(refreshMaterializedView('pg_class')).rejects.toThrow(/pg_class/)
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
