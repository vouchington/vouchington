import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { raceCopyrightPlacementRestores } from '@voucha/test-helpers/copyright-unavailable-restore-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { isTestCopyrightPlacementWithheld } from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import { processCopyrightActionIntent } from './index.mts'

describe('copyright restore serialization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('lets both restores finish and the final placement check see the other ended ground', async () => {
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

    const settled = await raceCopyrightPlacementRestores(first.target.placement_id, [
      () => processCopyrightActionIntent(first.restore.id, now),
      () => processCopyrightActionIntent(second.restore.id, now),
    ])
    expect(settled).toEqual([
      { status: 'fulfilled', value: 'applied' },
      { status: 'fulfilled', value: 'applied' },
    ])
    const aggregates = await Promise.all(
      [first, second].map(scene => getCopyrightNoticePrivateAggregate(scene.notice.id)),
    )
    expect(
      aggregates
        .flatMap(aggregate => aggregate?.restrictions ?? [])
        .filter(row => row.lifted_at === null),
    ).toEqual([])
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(false)
  })
})
