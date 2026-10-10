import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import { purgeUploaderForTest } from '@voucha/test-helpers/purge-uploader-for-test'
import { claimImageUpload, persistPromotedImageKey } from './complete-upload-state.mts'
import { persistImageHashWhileProcessing } from './complete-upload-digest.mts'
import { createImageUploadUrl } from './create-upload-url.mts'
import { getImageUploadState } from './get-upload-state.mts'
import { getImageByIdFromPrimary } from './get.mts'

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

    await purgeUploaderForTest(uploader, upload.image_id)
    expect(await getTestUserRaw(uploader.id)).toBeNull()
    await expect(getImageByIdFromPrimary(upload.image_id)).resolves.toMatchObject({
      id: upload.image_id,
      created_by_id: uploader.id,
      deleted_at: null,
      upload_started_at: null,
      sha_256: null,
      upload_completed_at: null,
      upload_failed_at: null,
      s3_key: upload.image_id,
    })

    await expect(createImageUploadUrl(uploader, uploadOptions)).rejects.toMatchObject({
      status: 401,
    })
    await expect(claimImageUpload(uploader.id, upload.image_id)).rejects.toMatchObject({
      status: 401,
    })
    await expect(getImageUploadState(uploader.id, upload.image_id)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('refuses promotion after an upload was claimed while its uploader was live', async () => {
    const uploader = await createTestUser()
    const upload = await createImageUploadUrl(uploader, uploadOptions)
    const claim = await claimImageUpload(uploader.id, upload.image_id)
    expect(claim.claimed).toBe(true)
    const hash = randomBytes(32)
    const processing = await persistImageHashWhileProcessing(hash, upload.image_id)
    expect(processing.upload_started_at).toBeInstanceOf(Date)
    expect(Buffer.from(processing.sha_256!)).toEqual(hash)

    await purgeUploaderForTest(uploader, upload.image_id)
    expect(await getTestUserRaw(uploader.id)).toBeNull()
    await expect(getImageByIdFromPrimary(upload.image_id)).resolves.toMatchObject({
      id: upload.image_id,
      created_by_id: uploader.id,
      deleted_at: null,
      upload_completed_at: null,
      upload_failed_at: null,
      s3_key: upload.image_id,
    })

    await expect(
      persistPromotedImageKey(upload.image_id, hash, `digest/${hash.toString('hex')}`),
    ).rejects.toMatchObject({ status: 401 })
    const retained = await getImageByIdFromPrimary(upload.image_id)
    expect(retained?.upload_started_at).toEqual(processing.upload_started_at)
    expect(Buffer.from(retained!.sha_256!)).toEqual(hash)
    expect(retained?.s3_key).toBe(upload.image_id)
  })
}, 5_000)
