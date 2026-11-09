import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUserDirect, insertTestImage } from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  raceTestImageSurfaceDeadlock,
  readTestDeadlockProfileImages,
} from '@voucha/test-helpers/image-surface-deadlock'
import { IMAGE_PLACEMENT_LIMIT_REACHED } from '@modules/on-error/error-codes'

describe('surface owner deadlock recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('rolls back the actual PostgreSQL deadlock victim before edge publication and returns a retryable conflict', async () => {
    const edge = installTestMediaDeliveryEdge()
    const [first, second] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    const [firstImage, secondImage] = await Promise.all([
      insertTestImage(first.id),
      insertTestImage(second.id),
    ])
    const outcomes = await raceTestImageSurfaceDeadlock(
      { userId: first.id, imageId: firstImage! },
      { userId: second.id, imageId: secondImage! },
    )
    expect(outcomes.filter(row => row.status === 'committed')).toHaveLength(1)
    expect(outcomes.filter(row => row.status === 'rejected')).toEqual([
      {
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: IMAGE_PLACEMENT_LIMIT_REACHED,
        }),
      },
    ])
    const owners = await readTestDeadlockProfileImages([first.id, second.id])
    expect(owners).toHaveLength(2)
    expect(owners.filter(owner => owner?.profile_image_id !== null)).toHaveLength(1)
    // Both preimages were empty, so even the winning activation has no old tuple to deny.
    expect(edge.put).not.toHaveBeenCalled()
  })
})
