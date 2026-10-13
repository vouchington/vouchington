import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  getTestDeliveryRepairMarker,
  reconcileTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { reconcileMediaDeliveryRepairMarkers } from './index.mts'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'

describe('scoped delivery repair', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('consumes only an owned repair marker and preserves the unrelated token', async () => {
    const selected = await createTestDeliverySurface()
    const unrelated = await createTestDeliverySurface()
    const selectedKey = selected.mediaDeliveryRegistryRecordId
    const unrelatedKey = unrelated.mediaDeliveryRegistryRecordId
    installTestMediaDeliveryEdge()
    await Promise.all([
      recordImageDeliveryRepairMarker(selected.tuple),
      recordImageDeliveryRepairMarker(unrelated.tuple),
    ])
    const unrelatedToken = await getTestDeliveryRepairMarker(unrelatedKey)
    expect(await reconcileMediaDeliveryRepairMarkers(10, [selectedKey])).toBe(1)
    expect(await getTestDeliveryRepairMarker(selectedKey)).toBeNull()
    expect(await getTestDeliveryRepairMarker(unrelatedKey)).toBe(unrelatedToken)
    await reconcileTestDeliveryRepairMarker(unrelatedKey)
  })
})
