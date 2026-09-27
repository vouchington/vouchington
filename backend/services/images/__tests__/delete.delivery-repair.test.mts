import { afterEach, describe, expect, it, vi } from 'vitest'
import { getImageModerationState } from '@voucha/test-helpers'
import {
  createTestPostDeliveryFixture,
  expectTestPostDeliveryRestored,
} from '@voucha/test-helpers/media-delivery-post'
import { deleteImageById } from '../delete.mts'

describe('image deletion delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('restores delivery after a pre-delete denial reaches the edge but invalidation fails', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const before = await getImageModerationState(fixture.imageId)
    const failure = new Error('Image deletion invalidation unavailable')
    fixture.edge.invalidatePath.mockRejectedValueOnce(failure)

    await expect(deleteImageById(fixture.imageId)).rejects.toBe(failure)

    await expect(getImageModerationState(fixture.imageId)).resolves.toEqual(before)
    await expectTestPostDeliveryRestored(fixture)
  })
})
