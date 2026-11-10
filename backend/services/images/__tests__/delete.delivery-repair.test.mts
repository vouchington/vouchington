import { afterEach, describe, expect, it, vi } from 'vitest'
import { getImageModerationState } from '@voucha/test-helpers'
import { createTestPostDeliveryFixture } from '@voucha/test-helpers/media-delivery-post'
import { deleteImageById } from '../delete.mts'

describe('image deletion delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('deletes an image without publishing an edge denial', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const before = await getImageModerationState(fixture.imageId)

    await deleteImageById(fixture.imageId)

    await expect(getImageModerationState(fixture.imageId)).resolves.not.toEqual(before)
    expect(fixture.edge.put).not.toHaveBeenCalled()
    expect(fixture.edge.invalidatePath).not.toHaveBeenCalled()
  })
})
