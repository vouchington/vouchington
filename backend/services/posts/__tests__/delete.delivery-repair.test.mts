import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestPostDeliveryFixture,
  expectTestPostDeliveryRestored,
} from '@voucha/test-helpers/media-delivery-post'
import { deletePost } from '../delete.mts'

describe('post deletion delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('restores delivery after a pre-delete denial reaches the edge but invalidation fails', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const failure = new Error('Post deletion invalidation unavailable')
    fixture.edge.invalidatePath.mockRejectedValueOnce(failure)

    await expect(deletePost(fixture.user, fixture.post)).rejects.toBe(failure)

    await expectTestPostDeliveryRestored(fixture)
  })
})
