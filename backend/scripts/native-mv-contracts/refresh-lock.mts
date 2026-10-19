import assert from 'node:assert/strict'
import { scheduler } from 'node:timers/promises'
import type { PoolClient } from '@data-stores/psql/types'
import { writePool } from '@data-stores/psql/setup'
import { refreshMaterializedView } from '@data-stores/psql/migrate'

const lockKey = 'refresh-materialized-view'
const contentionMessage = 'Materialized view refresh contention; retryable'

async function refreshAfterContention(
  viewName: string,
  onRetryableContention: () => void = () => {},
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (true) {
    try {
      await refreshMaterializedView(viewName)
      return
    } catch (err) {
      if (!(err instanceof Error) || err.message !== contentionMessage) throw err
      if (Date.now() >= deadline) throw err
      onRetryableContention()
      await scheduler.wait(50)
    }
  }
}

async function unlock(holder: PoolClient): Promise<void> {
  const result = await holder.query<{ unlocked: boolean }>(
    '/* checkRefreshLockContracts.unlock */ SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
    [lockKey],
  )
  assert.equal(result.rows[0]?.unlocked, true, 'the owned session must release the refresh lock')
}

export async function checkRefreshLockContracts(): Promise<void> {
  const holder = await writePool.connect()
  let locked = false
  let retry: Promise<'fulfilled' | 'rejected'> | undefined
  let failure: unknown
  let failed = false
  try {
    const acquired = await holder.query<{ locked: boolean }>(
      '/* checkRefreshLockContracts.lock */ SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [lockKey],
    )
    locked = acquired.rows[0]?.locked ?? false
    assert.equal(locked, true, 'the native preflight must own the refresh advisory lock')
    await assert.rejects(refreshMaterializedView('mv_rss_feed_crawl_tiers'), {
      message: contentionMessage,
    })
    const observerFailure = new Error('contention observer failed')
    let observed = 0
    await assert.rejects(
      refreshAfterContention('mv_rss_feed_crawl_tiers', () => {
        observed += 1
        throw observerFailure
      }),
      error => error === observerFailure,
    )
    assert.equal(observed, 1, 'observer failure must stop retries synchronously')
    const retryObserved = Promise.withResolvers<void>()
    retry = refreshAfterContention('mv_rss_feed_crawl_tiers', () => retryObserved.resolve()).then(
      () => 'fulfilled' as const,
      () => 'rejected' as const,
    )
    assert.equal(
      await Promise.race([retry, retryObserved.promise.then(() => 'retrying' as const)]),
      'retrying',
    )
    await unlock(holder)
    locked = false
    assert.equal(await retry, 'fulfilled', 'the real refresh must succeed after lock release')
    await refreshMaterializedView('mv_top_hashtags')
  } catch (err) {
    failed = true
    failure = err
  }

  let cleanupError: unknown
  let cleanupFailed = false
  if (locked) {
    try {
      await unlock(holder)
    } catch (err) {
      cleanupFailed = true
      cleanupError = err
    }
  }
  holder.release(cleanupFailed ? (cleanupError instanceof Error ? cleanupError : true) : undefined)
  if (retry) await retry
  if (cleanupFailed && failed) {
    throw new AggregateError([failure, cleanupError], 'refresh contract and cleanup failed')
  }
  if (cleanupFailed) throw cleanupError
  if (failed) throw failure
}
