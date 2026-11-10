import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestPostDeliveryFixture } from '@voucha/test-helpers/media-delivery-post'
import { getPostImages, setPostImages } from '../images.mts'
import { withPostgresQueryFailureForTest } from '../../../test-helpers/postgres-query-failure.mts'
import { insertTestImage } from '@voucha/test-helpers'

describe('post image update delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('clears attachments without publishing an edge denial', async () => {
    const fixture = await createTestPostDeliveryFixture()

    await setPostImages(fixture.user, fixture.post, [])

    await expect(getPostImages(fixture.postId)).resolves.toEqual([])
    expect(fixture.edge.put).not.toHaveBeenCalled()
    expect(fixture.edge.invalidatePath).not.toHaveBeenCalled()
  })

  it('keeps attachments when a prepared image update fails before commit', async () => {
    const fixture = await createTestPostDeliveryFixture()
    const before = await getPostImages(fixture.postId)
    const replacementImageId = await insertTestImage(fixture.user.id)
    const { result, error } = await withPostgresQueryFailureForTest(
      '/* setPostImages:moderationContentSha */',
      () =>
        setPostImages(fixture.user, fixture.post, [
          { image_id: replacementImageId, order_index: 0 },
        ]).catch((err: unknown) => err),
    )

    expect(result).toBe(error)
    await expect(getPostImages(fixture.postId)).resolves.toEqual(before)
    expect(fixture.edge.put).not.toHaveBeenCalled()
  })
})
