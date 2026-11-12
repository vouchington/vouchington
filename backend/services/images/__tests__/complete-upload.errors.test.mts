import { createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import {
  createTestUser,
  insertPendingTestImage,
  markImageDeleted,
  setImageHashAndProcessing,
} from '@voucha/test-helpers'
import { putS3Object, s3ObjectExists } from '@voucha/test-helpers/aws-emulator-s3'
import type { PrivateUser } from '@voucha/types/entities/user'
import { MAX_IMAGE_UPLOAD_BYTES } from '../freeze-upload.mts'
import { MediaSizeLimitError } from '@vouchington/media'
import { completeImageUpload } from '../complete-upload.mts'
import * as imageReads from '../get.mts'
import { getImageById } from '../get.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import * as s3Module from '../s3-upload-lifecycle.mts'

function stageSource(imageId: string, bytes: Buffer) {
  return putS3Object({ Bucket: S3Buckets.imageUploads, Key: imageId, Body: bytes })
}

describe('completeImageUpload utility failures', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('preserves unexpected hashing failures and marks the claimed upload failed', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const error = new Error('hashing failed')
    // A response body that breaks mid-read cannot be produced by the emulator, so this one case
    // still replaces the source read with a stream that fails while it is hashed.
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      $metadata: {},
      Body: new Readable({
        read() {
          this.destroy(error)
        },
      }),
    } as unknown as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)

    await expect(completeImageUpload(user, imageId)).rejects.toBe(error)
    const image = await getImageById(imageId)
    expect(image && deriveUploadStatus(image)).toBe('failed')
    expect(image?.upload_error).toBe('hashing failed')
  })

  it('preserves the hard streamed-size error and terminalizes the claimed upload', async () => {
    const imageId = await insertPendingTestImage(user.id)
    // The 50 MiB limit has no override, so a real fixture would park an oversized object in the
    // shared in-memory emulator (which also rejects a single PUT that large). Only this case
    // replaces the source read with a stream one byte past the limit.
    const chunk = Buffer.alloc(1024 * 1024)
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      $metadata: {},
      Body: Readable.from(
        (function* () {
          for (let index = 0; index < MAX_IMAGE_UPLOAD_BYTES / chunk.length; index++) yield chunk
          yield Buffer.alloc(1)
        })(),
      ),
    } as unknown as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)

    const failure = await completeImageUpload(user, imageId)
      .then(() => null)
      .catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(MediaSizeLimitError)
    const image = await getImageById(imageId)
    expect(image && deriveUploadStatus(image)).toBe('failed')
    expect(image?.upload_error).toBe((failure as Error).message)
  })

  it('rejects and removes an upload matching a previously deleted image', async () => {
    const bytes = Buffer.from(`previously deleted ${randomBytes(16).toString('hex')}`)
    const imageId = await insertPendingTestImage(user.id)
    const deletedImageId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(deletedImageId, createHash('sha256').update(bytes).digest())
    await markImageDeleted(deletedImageId)
    await stageSource(imageId, bytes)

    await expect(completeImageUpload(user, imageId)).rejects.toMatchObject({
      status: 400,
      message: 'Image was previously flagged and deleted',
    })

    await expect(s3ObjectExists(S3Buckets.imageUploads, imageId)).resolves.toBe(false)
    expect(await getImageById(imageId)).toBeNull()
  })

  it('returns the committed winner when digest persistence loses a unique race', async () => {
    const bytes = Buffer.from(`unique race ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const imageId = await insertPendingTestImage(user.id)
    const winnerId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(winnerId, hash)
    await stageSource(imageId, bytes)
    // The first digest lookup predates the winner's commit; persistence then hits the real unique index.
    vi.spyOn(imageReads, 'getImageByHash').mockResolvedValueOnce(null)

    await expect(completeImageUpload(user, imageId)).resolves.toMatchObject({
      id: winnerId,
      sha_256: hash,
    })
    await expect(s3ObjectExists(S3Buckets.imageUploads, imageId)).resolves.toBe(false)
    expect(await getImageById(imageId)).toBeNull()
  })

  it('preserves a unique violation when no committed winner can be loaded', async () => {
    const bytes = Buffer.from(`unique violation ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const imageId = await insertPendingTestImage(user.id)
    const deletedWinnerId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(deletedWinnerId, hash)
    await markImageDeleted(deletedWinnerId)
    await stageSource(imageId, bytes)
    // The stale first lookup hides the deleted owner; the retained digest still violates the unique index.
    vi.spyOn(imageReads, 'getImageByHash').mockResolvedValueOnce(null)

    await expect(completeImageUpload(user, imageId)).rejects.toMatchObject({ code: '23505' })
    expect(await getImageById(imageId)).toBeNull()
    await expect(s3ObjectExists(S3Buckets.imageUploads, imageId)).resolves.toBe(false)
  })
})
