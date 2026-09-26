import { describe, expect, it } from 'vitest'
import {
  getImagePlacementDeliveryKey,
  parseImagePlacementDeliveryKey,
} from './delivery-registry-types.mts'

describe('concrete image placement keys', () => {
  const tuple = { placementId: crypto.randomUUID(), revision: 3, imageId: crypto.randomUUID() }
  it('round-trips the exact canonical tuple', () => {
    expect(parseImagePlacementDeliveryKey(getImagePlacementDeliveryKey(tuple))).toEqual(tuple)
  })
  it.each([
    'legacy-image:abc',
    'image-placement:missing',
    `image-placement:${tuple.placementId}:03:${tuple.imageId}`,
    `image-placement:${tuple.placementId}:2147483648:${tuple.imageId}`,
    getImagePlacementDeliveryKey(tuple).toUpperCase(),
    `${getImagePlacementDeliveryKey(tuple)}\n`,
  ])('rejects unsupported or noncanonical identity %s', key => {
    expect(() => parseImagePlacementDeliveryKey(key)).toThrow(
      'Invalid image placement delivery key',
    )
  })
})
