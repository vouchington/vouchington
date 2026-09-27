import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestPostDeliveryFixture,
  expectTestPostDeliveryRestored,
} from '@voucha/test-helpers/media-delivery-post'
import { getPostImages, setPostImages } from '../images.mts'

describe('post image update delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('preserves attachments and restores delivery when removal invalidation fails', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const before = await getPostImages(fixture.postId)
    const failure = new Error('Post image removal invalidation unavailable')
    fixture.edge.invalidatePath.mockRejectedValueOnce(failure)

    await expect(setPostImages(fixture.user, fixture.post, [])).rejects.toBe(failure)

    await expect(getPostImages(fixture.postId)).resolves.toEqual(before)
    await expectTestPostDeliveryRestored(fixture)
  })
})
