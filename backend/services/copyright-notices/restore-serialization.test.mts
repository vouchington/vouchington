import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { isTestCopyrightPlacementWithheld } from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import { processCopyrightActionIntent } from './index.mts'

describe('copyright restore serialization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('lets the retried restore see that the other restriction lifted, so the placement is restored', async () => {
    installTestMediaDeliveryEdge()
    const first = await openHeldCounterNoticeRestore()
    const second = await openHeldCounterNoticeRestore(1, {
      claimant: first.claimant,
      placementId: first.target.placement_id,
      imageId: first.target.image_id,
    })
    const now = new Date(
      Math.max(first.restorationAt.getTime(), second.restorationAt.getTime()) + 1000,
    )
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(true)

    // Both restores read the other restriction as active before either lifts its own.
    const bothRead = Promise.withResolvers<void>()
    let reads = 0
    const { result: settled } = await observeTestPostgresClientQueries(
      () =>
        Promise.allSettled([
          processCopyrightActionIntent(first.restore.id, now),
          processCopyrightActionIntent(second.restore.id, now),
        ]),
      async query => {
        if (!query.text.includes('processCopyrightActionIntent:otherActiveRestrictions')) return
        if (++reads === 2) bothRead.resolve()
        await bothRead.promise
      },
    )

    const rejected = settled.filter(outcome => outcome.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.reason).toMatchObject({ status: 409, cause: { code: '40001' } })
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(true)

    const later = new Date(now.getTime() + 60 * 60 * 1000)
    const retried = settled[0].status === 'rejected' ? first : second
    await expect(processCopyrightActionIntent(retried.restore.id, later)).resolves.toBe('applied')
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(false)
  })
})
