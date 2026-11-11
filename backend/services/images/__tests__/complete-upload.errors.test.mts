import { createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertPendingTestImage,
  markImageDeleted,
  setImageHashAndProcessing,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { MediaSizeLimitError } from '@vouchington/media'
import { completeImageUpload } from '../complete-upload.mts'
import * as imageReads from '../get.mts'
import { getImageById } from '../get.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import * as s3Module from '../s3-upload-lifecycle.mts'

type SourceBody = Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>

function stubSource(body: Readable) {
  vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
    Body: body,
  } as SourceBody)
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
    stubSource(
      new Readable({
        read() {
          this.destroy(error)
        },
      }),
    )

    await expect(completeImageUpload(user, imageId)).rejects.toBe(error)
    const image = await getImageById(imageId)
    expect(image && deriveUploadStatus(image)).toBe('failed')
    expect(image?.upload_error).toBe('hashing failed')
  })

  it('preserves the hard streamed-size error and terminalizes the claimed upload', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const chunk = Buffer.alloc(1024 * 1024)
    stubSource(
      Readable.from(
        (function* () {
          for (let index = 0; index < 51; index++) yield chunk
        })(),
      ),
    )

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
    stubSource(Readable.from([bytes]))
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()

    await expect(completeImageUpload(user, imageId)).rejects.toMatchObject({
      status: 400,
      message: 'Image was previously flagged and deleted',
    })

    expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    expect(await getImageById(imageId)).toBeNull()
  })

  it('returns the committed winner when digest persistence loses a unique race', async () => {
    const bytes = Buffer.from(`unique race ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const imageId = await insertPendingTestImage(user.id)
    const winnerId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(winnerId, hash)
    stubSource(Readable.from([bytes]))
    // The first digest lookup predates the winner's commit; persistence then hits the real unique index.
    vi.spyOn(imageReads, 'getImageByHash').mockResolvedValueOnce(null)
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()

    await expect(completeImageUpload(user, imageId)).resolves.toMatchObject({
      id: winnerId,
      sha_256: hash,
    })
    expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    expect(await getImageById(imageId)).toBeNull()
  })

  it('preserves a unique violation when no committed winner can be loaded', async () => {
    const bytes = Buffer.from(`unique violation ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const imageId = await insertPendingTestImage(user.id)
    const deletedWinnerId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(deletedWinnerId, hash)
    await markImageDeleted(deletedWinnerId)
    stubSource(Readable.from([bytes]))
    // The stale first lookup hides the deleted owner; the retained digest still violates the unique index.
    vi.spyOn(imageReads, 'getImageByHash').mockResolvedValueOnce(null)
    vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()

    await expect(completeImageUpload(user, imageId)).rejects.toMatchObject({ code: '23505' })
    expect(await getImageById(imageId)).toBeNull()
  })
})
