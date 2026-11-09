import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestImage,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers'
import { writeTestImageSurfaceMutation } from '@voucha/test-helpers/image-surface-mutation'

describe('surface owner SQL savepoint recovery', () => {
  it('recovers a failed owner SQL callback before a valid mutation using the same parent executor', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await using query = await beginTransaction()
    await expect(
      writeTestImageSurfaceMutation(
        { surfaceKind: 'user-profile-image', userId: user.id },
        crypto.randomUUID(),
        user.id,
        query,
      ),
    ).rejects.toMatchObject({ code: expect.any(String) })
    await writeTestImageSurfaceMutation(
      { surfaceKind: 'user-profile-image', userId: user.id },
      imageId,
      user.id,
      query,
    )
    await query.commit()
    const placements = await getTestImageSurfacePlacements({ userId: user.id })
    expect(placements).toHaveLength(1)
    expect(placements[0]).toMatchObject({ image_id: imageId, retired_at: null })
  })
})
