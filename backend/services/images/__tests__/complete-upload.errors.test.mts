import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, insertPendingTestImage } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { Readable } from 'node:stream'
import { MediaSizeLimitError } from '@vouchington/media'
import { getImageById } from '../get.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import * as s3Module from '../s3-upload-lifecycle.mts'

const { freezeImageUploadMock, getImageByHashMock, persistImageHashWhileProcessingMock } =
  vi.hoisted(() => ({
    freezeImageUploadMock: vi.fn<typeof import('../freeze-upload.mts').freezeImageUpload>(),
    getImageByHashMock: vi.fn<typeof import('../get.mts').getImageByHash>(),
    persistImageHashWhileProcessingMock:
      vi.fn<typeof import('../complete-upload-digest.mts').persistImageHashWhileProcessing>(),
  }))

const { completeImageUpload } = await import('../complete-upload.mts')

const digestRaceDependencies = {
  freezeImageUpload: freezeImageUploadMock,
  getImageByHash: getImageByHashMock,
  persistImageHashWhileProcessing: persistImageHashWhileProcessingMock,
}

describe('completeImageUpload utility failures', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    freezeImageUploadMock.mockReset()
    getImageByHashMock.mockReset()
    persistImageHashWhileProcessingMock.mockReset()
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([Buffer.from('image')]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
  })

  it('preserves unexpected hashing failures and marks the claimed upload failed', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const error = new Error('hashing failed')
    freezeImageUploadMock.mockRejectedValue(error)

    await expect(
      completeImageUpload(user, imageId, { freezeImageUpload: freezeImageUploadMock }),
    ).rejects.toBe(error)
    const image = await getImageById(imageId)
    expect(image && deriveUploadStatus(image)).toBe('failed')
    expect(image?.upload_error).toBe(error.message)
  })

  it('does not reinterpret typed utility errors as workflow errors', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const error = new Error('invalid media policy')
    freezeImageUploadMock.mockRejectedValue(error)

    await expect(
      completeImageUpload(user, imageId, { freezeImageUpload: freezeImageUploadMock }),
    ).rejects.toBe(error)
    const image = await getImageById(imageId)
    expect(image && deriveUploadStatus(image)).toBe('failed')
    expect(image?.upload_error).toBe(error.message)
  })

  it('preserves the hard streamed-size error and terminalizes the claimed upload', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const error = new MediaSizeLimitError(50 * 1024 * 1024, 50 * 1024 * 1024 + 1)
    freezeImageUploadMock.mockRejectedValue(error)

    await expect(
      completeImageUpload(user, imageId, { freezeImageUpload: freezeImageUploadMock }),
    ).rejects.toBe(error)
    const image = await getImageById(imageId)
    expect(image && deriveUploadStatus(image)).toBe('failed')
    expect(image?.upload_error).toBe(error.message)
  })

  it('rejects and removes an upload matching a previously deleted image', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const deletedImageId = await insertPendingTestImage(user.id)
    const deletedImage = await getImageById(deletedImageId)
    expect(deletedImage).not.toBeNull()
    freezeImageUploadMock.mockResolvedValue(frozenUpload('ab'))
    getImageByHashMock.mockResolvedValueOnce({ ...deletedImage!, deleted_at: new Date() })
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()

    await expect(
      completeImageUpload(user, imageId, {
        freezeImageUpload: freezeImageUploadMock,
        getImageByHash: getImageByHashMock,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Image was previously flagged and deleted',
    })

    expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    expect(await getImageById(imageId)).toBeNull()
  })

  it('returns the committed winner when digest persistence loses a unique race', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const winnerId = await insertPendingTestImage(user.id)
    const winner = await getImageById(winnerId)
    expect(winner).not.toBeNull()
    freezeImageUploadMock.mockResolvedValue(frozenUpload('cd'))
    getImageByHashMock.mockResolvedValueOnce(null).mockResolvedValueOnce(winner)
    persistImageHashWhileProcessingMock.mockRejectedValue({ code: '23505' })
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()

    await expect(completeImageUpload(user, imageId, digestRaceDependencies)).resolves.toEqual(
      winner,
    )
    expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: imageId }))
    expect(await getImageById(imageId)).toBeNull()
  })

  it('preserves a unique violation when no committed winner can be loaded', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const error = { code: '23505' }
    freezeImageUploadMock.mockResolvedValue(frozenUpload('ef'))
    getImageByHashMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    persistImageHashWhileProcessingMock.mockRejectedValue(error)
    vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()

    await expect(completeImageUpload(user, imageId, digestRaceDependencies)).rejects.toBe(error)
    expect(await getImageById(imageId)).toBeNull()
  })
})

function frozenUpload(byte: string) {
  return {
    bytes: 32,
    cleanup: vi.fn<() => Promise<void>>(async () => undefined),
    filename: '/unused/frozen-upload',
    sha256: Buffer.from(byte.repeat(32), 'hex'),
  }
}
