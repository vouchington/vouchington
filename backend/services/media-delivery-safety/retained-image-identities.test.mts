import { beginTransaction } from '@voucha/test-helpers'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import { describe, expect, it } from 'vitest'
import { ensureImagePlacementBinding } from './retained-image-identities.mts'

describe('retained image placement identity', () => {
  it('pins the exact owner family, not only the image and placement pair', async () => {
    const { tuple } = await createTestDeliverySurface()
    await using query = await beginTransaction()
    await expect(
      ensureImagePlacementBinding(query, { ...tuple, bindingFamily: 'post' }),
    ).rejects.toThrow('already bound')
    await expect(
      ensureImagePlacementBinding(query, { ...tuple, bindingFamily: 'surface' }),
    ).resolves.toBeUndefined()
  })
})
