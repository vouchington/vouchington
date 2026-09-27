import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  getTestDeliveryRepairMarker,
  reconcileTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import {
  getImagePlacementDeliveryKey,
  reconcileMediaDeliveryRepairMarkers,
  reserveImagePlacementBinding,
} from './index.mts'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'

describe('scoped delivery repair', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('consumes only an owned repair marker and preserves the unrelated token', async () => {
    const selected = await createReservedNeverLiveTuple()
    const unrelated = await createReservedNeverLiveTuple()
    const selectedKey = getImagePlacementDeliveryKey(selected)
    const unrelatedKey = getImagePlacementDeliveryKey(unrelated)
    installTestMediaDeliveryEdge()
    await Promise.all([
      recordImageDeliveryRepairMarker(selected),
      recordImageDeliveryRepairMarker(unrelated),
    ])
    const unrelatedToken = await getTestDeliveryRepairMarker(unrelatedKey)
    expect(await reconcileMediaDeliveryRepairMarkers(10, [selectedKey])).toBe(1)
    expect(await getTestDeliveryRepairMarker(selectedKey)).toBeNull()
    expect(await getTestDeliveryRepairMarker(unrelatedKey)).toBe(unrelatedToken)
    await reconcileTestDeliveryRepairMarker(unrelatedKey)
  })
})

async function createReservedNeverLiveTuple(): Promise<{
  placementId: string
  revision: number
  imageId: string
}> {
  const tuple = { placementId: crypto.randomUUID(), revision: 0, imageId: crypto.randomUUID() }
  await reserveImagePlacementBinding({ ...tuple, bindingFamily: 'surface' })
  return tuple
}
