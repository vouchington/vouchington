import { describe, expect, it } from 'vitest'
import { withPostgresAdvisoryLockQueryFailureForTest } from '@voucha/test-helpers/postgres-advisory-query-failure'
import { withRssFeedItemCategorySnapshotLocks } from '../category-snapshot-lock.mts'

describe('category snapshot unlock recovery', () => {
  it('preserves an unlock failure and releases its session locks for a retry', async () => {
    const itemId = crypto.randomUUID()
    let callbackRan = false
    const { result, error } = await withPostgresAdvisoryLockQueryFailureForTest(
      '/* withRssFeedItemCategorySnapshotLocks.unlock */',
      () =>
        withRssFeedItemCategorySnapshotLocks([itemId], async () => {
          callbackRan = true
          return 'reconciled'
        }).catch((err: unknown) => err),
    )

    expect(callbackRan).toBe(true)
    expect(error).toMatchObject({ code: '25P02' })
    expect(result).toBe(error)
    await expect(
      withRssFeedItemCategorySnapshotLocks([itemId], async () => 'retried'),
    ).resolves.toBe('retried')
  })
})
