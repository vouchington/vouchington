import { beginTransaction } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  pinImagePlacementBinding,
  reserveImagePlacementBinding,
} from './retained-image-identities.mts'

describe('retained image placement identity', () => {
  it('pins the exact owner family, not only the image and placement pair', async () => {
    const tuple = {
      placementId: crypto.randomUUID(),
      imageId: crypto.randomUUID(),
      bindingFamily: 'surface' as const,
    }
    await reserveImagePlacementBinding(tuple)
    await using query = await beginTransaction()
    await expect(
      pinImagePlacementBinding(query, { ...tuple, bindingFamily: 'post' }),
    ).resolves.toBe(false)
    await expect(pinImagePlacementBinding(query, tuple)).resolves.toBe(true)
  })
})
