import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { claimImageUpload } from './complete-upload-state.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageUploadState } from './get-upload-state.mts'

const presign = async () => 'https://example.test/staged-image'

describe('retained uploader identity', () => {
  it('rejects a stale deleted account at every upload authorization boundary', async () => {
    const user = await createTestUser()
    const upload = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
      dependencies: { presignImageUploadUrl: presign },
    })
    await deleteUserAndDrainForTest(user, user)

    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
        dependencies: { presignImageUploadUrl: presign },
      }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(claimImageUpload(user.id, upload.image_id)).rejects.toMatchObject({ status: 401 })
    await expect(getImageUploadState(user.id, upload.image_id)).rejects.toMatchObject({
      status: 404,
    })
  })
})
