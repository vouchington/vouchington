import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import { purgeUploaderForTest } from '@voucha/test-helpers/purge-uploader-for-test'
import { claimImageUpload, persistPromotedImageKey } from './complete-upload-state.mts'
import { persistImageHashWhileProcessing } from './complete-upload-digest.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageUploadState } from './get-upload-state.mts'

const presign = async () => 'https://example.test/staged-image'
const uploadOptions = {
  contentType: 'image/jpeg',
  contentLength: 1024,
  dependencies: { presignImageUploadUrl: presign },
}

describe('hard-purged uploader identity', () => {
  it('does not authorize new upload, old pending claim, or state read after purge', async () => {
    const uploader = await createTestUser()
    const upload = await createImageUploadUrl(uploader, uploadOptions)
    await expect(getImageUploadState(uploader.id, upload.image_id)).resolves.toMatchObject({
      upload_status: 'pending',
    })

    await purgeUploaderForTest(uploader)
    expect(await getTestUserRaw(uploader.id)).toBeNull()

    await expect(createImageUploadUrl(uploader, uploadOptions)).rejects.toMatchObject({
      status: 401,
    })
    await expect(claimImageUpload(uploader.id, upload.image_id)).rejects.toMatchObject({
      status: 401,
    })
    await expect(getImageUploadState(uploader.id, upload.image_id)).rejects.toMatchObject({
      status: 404,
    })
  }, 60_000)

  it('refuses promotion after an upload was claimed while its uploader was live', async () => {
    const uploader = await createTestUser()
    const upload = await createImageUploadUrl(uploader, uploadOptions)
    const claim = await claimImageUpload(uploader.id, upload.image_id)
    expect(claim.claimed).toBe(true)
    const hash = randomBytes(32)
    await persistImageHashWhileProcessing(hash, upload.image_id)

    await purgeUploaderForTest(uploader)
    expect(await getTestUserRaw(uploader.id)).toBeNull()

    await expect(
      persistPromotedImageKey(upload.image_id, hash, `digest/${hash.toString('hex')}`),
    ).rejects.toMatchObject({ status: 401 })
  }, 60_000)
})
