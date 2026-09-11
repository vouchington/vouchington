import { describe, expect, it } from 'vitest'
import {
  getTestPostgresAdvisoryLockHolderProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import {
  RSS_CATEGORY_SNAPSHOT_LOCK_NAMESPACE,
  withRssFeedItemCategorySnapshotLocks,
} from './category-snapshot-lock.mts'

describe('RSS feed item category snapshot locks', () => {
  it('serializes overlapping operations for the same RSS feed item', async () => {
    const itemId = crypto.randomUUID()
    const firstEntered = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    let secondEntered = false

    const first = withRssFeedItemCategorySnapshotLocks([itemId], async () => {
      firstEntered.resolve()
      await releaseFirst.promise
    })
    await firstEntered.promise
    const firstHolderProcessId = await getTestPostgresAdvisoryLockHolderProcessId({
      namespace: RSS_CATEGORY_SNAPSHOT_LOCK_NAMESPACE,
      key: itemId,
    })
    const second = withRssFeedItemCategorySnapshotLocks([itemId], async () => {
      secondEntered = true
    })

    await waitForTestPostgresLockWaiter(
      firstHolderProcessId,
      'withRssFeedItemCategorySnapshotLocks.lock',
    )
    expect(secondEntered).toBe(false)
    releaseFirst.resolve()
    await Promise.all([first, second])
    expect(secondEntered).toBe(true)
  })

  it('allows operations for distinct RSS feed items to enter concurrently', async () => {
    let released = false
    const firstEntered = Promise.withResolvers<void>()
    const secondEntered = Promise.withResolvers<void>()
    const secondObservedReleased = Promise.withResolvers<boolean>()

    const first = withRssFeedItemCategorySnapshotLocks([crypto.randomUUID()], async () => {
      firstEntered.resolve()
      // Release as soon as `second` reports having entered (the expected concurrent path).
      // The bounded timeout below is a diagnostic fallback only, for the incorrectly-shared-
      // lock case where `second` can never enter until `first` finishes — it must not be the
      // primary correctness signal, since a genuinely concurrent `second` may take longer than
      // any fixed delay to obtain an advisory-lock pool connection under CI/pool contention.
      await Promise.race([
        secondEntered.promise,
        new Promise<void>(resolve => {
          AbortSignal.timeout(5_000).addEventListener('abort', () => resolve(), { once: true })
        }),
      ])
      released = true
    })
    await firstEntered.promise

    const second = withRssFeedItemCategorySnapshotLocks([crypto.randomUUID()], async () => {
      // Record `released` as this callback's very first action, before doing anything that
      // could let `first` proceed. If distinct item IDs incorrectly shared a lock key, this
      // callback cannot start until `first` releases via the diagnostic timeout above, so it
      // would observe (and fail on) released === true instead of racing a fixed sleep.
      secondObservedReleased.resolve(released)
      secondEntered.resolve()
    })

    expect(await secondObservedReleased.promise).toBe(false)
    await Promise.all([first, second])
  })
})
