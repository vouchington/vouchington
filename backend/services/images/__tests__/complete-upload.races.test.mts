import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertPendingTestImage,
  setImageHashAndProcessing,
  updateImageStatus,
} from '@voucha/test-helpers'
import { createImageUploadUrl } from '../create-upload-url.mts'
import { completeImageUpload } from '../complete-upload.mts'
import { getImageByHash, getImageById } from '../get.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import { withImageStorageLifecycleLock } from '../storage-lifecycle-lock.mts'
import { imagesQueue } from '@queues/images/queues'

import * as s3Module from '../s3-upload-lifecycle.mts'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { deepStrictEqual } from 'node:assert'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('completeImageUpload - duplicate recovery and races', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await imagesQueue.obliterate({ force: true })
    vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()
    vi.spyOn(s3Module, 'deleteImageDeliveryAliasFromS3').mockResolvedValue()
    vi.spyOn(s3Module, 'promoteFrozenImageToS3').mockImplementation(
      async ({ filename, sha256 }) => {
        const bytes = await readFile(filename)
        deepStrictEqual(createHash('sha256').update(bytes).digest(), sha256)
        return { created: true, s3Key: sha256.toString('hex') }
      },
    )
    vi.spyOn(s3Module, 'ensureImageDeliveryAliasInS3').mockImplementation(
      async (imageId, { filename, sha256 }) => {
        const bytes = await readFile(filename)
        deepStrictEqual(createHash('sha256').update(bytes).digest(), sha256)
        return { created: true, s3Key: imageId }
      },
    )
  })

  it('allows a fresh upload when an older matching upload failed', async () => {
    const mockImageData = Buffer.from(`retry image data ${randomBytes(16).toString('hex')}`)
    const mockHash = createHash('sha256').update(mockImageData).digest()
    const failedImageId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(failedImageId, mockHash)
    await updateImageStatus(failedImageId, 'failed')
    const { image_id: retryImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([mockImageData]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3')

    const result = await completeImageUpload(user, retryImageId)

    expect(result.id).toBe(retryImageId)
    expect(deriveUploadStatus(result)).toBe('processing')
    expect(await getImageById(failedImageId)).toBeNull()
    expect(deleteFromS3Spy).toHaveBeenCalledTimes(2)
    expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: failedImageId }))
    expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: retryImageId }))
    expect(s3Module.deleteImageDeliveryAliasFromS3).toHaveBeenCalledWith(failedImageId)
    const replacementJobs = (await imagesQueue.getJobs('waiting')).filter(
      job => (job.data as { id?: string }).id === retryImageId,
    )
    expect(replacementJobs).toHaveLength(1)
  })

  it('retains a failed duplicate row when its source cannot be deleted', async () => {
    const bytes = Buffer.from(`failed duplicate cleanup ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const failedImageId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(failedImageId, hash)
    await updateImageStatus(failedImageId, 'failed')
    const { image_id: retryImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([bytes]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    vi.mocked(s3Module.deleteImageUploadSourceFromS3).mockImplementation(async image => {
      if (image.id === failedImageId) throw new Error('failed duplicate source delete failed')
    })

    await expect(completeImageUpload(user, retryImageId)).rejects.toThrow(
      'failed duplicate source delete failed',
    )

    expect(await getImageById(failedImageId)).not.toBeNull()
    const retry = await getImageById(retryImageId)
    expect(retry && deriveUploadStatus(retry)).toBe('failed')
  })

  it('waits for failed-image storage cleanup before replacing its digest owner', async () => {
    const bytes = Buffer.from(`failed lifecycle race ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const failedImageId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(failedImageId, hash)
    await updateImageStatus(failedImageId, 'failed')
    const { image_id: retryImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([bytes]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)

    let releaseLock!: () => void
    let lockAcquired!: () => void
    const lockReleased = new Promise<void>(resolve => (releaseLock = resolve))
    const acquired = new Promise<void>(resolve => (lockAcquired = resolve))
    const lockHolder = withImageStorageLifecycleLock(failedImageId, async () => {
      lockAcquired()
      await lockReleased
    })
    await acquired

    let hashLookupCompleted!: () => void
    const hashLookup = new Promise<void>(resolve => (hashLookupCompleted = resolve))
    const completion = completeImageUpload(user, retryImageId, {
      async getImageByHash(...args) {
        const image = await getImageByHash(...args)
        hashLookupCompleted()
        return image
      },
    })
    void completion.catch(() => {})
    await hashLookup
    await new Promise<void>(resolve => setImmediate(resolve))

    expect(s3Module.deleteImageUploadSourceFromS3).not.toHaveBeenCalled()

    releaseLock()
    await lockHolder
    await expect(completion).resolves.toMatchObject({ id: retryImageId })
    expect(s3Module.deleteImageUploadSourceFromS3).toHaveBeenCalledWith(
      expect.objectContaining({ id: failedImageId }),
    )
  })

  it('marks a claimed upload as failed when streamed hashing fails', async () => {
    const imageId = await insertPendingTestImage(user.id)
    const error = new Error('S3 stream failed')
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockRejectedValue(error)

    await expect(completeImageUpload(user, imageId)).rejects.toBe(error)

    const failed = await getImageById(imageId)
    expect(failed && deriveUploadStatus(failed)).toBe('failed')
    expect(failed?.upload_error).toBe('S3 stream failed')
  })

  it('recovers the winning image when digest persistence races', async () => {
    const bytes = Buffer.from(`digest race ${randomBytes(16).toString('hex')}`)
    const firstImageId = await insertPendingTestImage(user.id)
    const secondImageId = await insertPendingTestImage(user.id)
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockImplementation(
      async () =>
        ({
          Body: Readable.from([bytes]),
        }) as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>,
    )

    const results = await Promise.all([
      completeImageUpload(user, firstImageId),
      completeImageUpload(user, secondImageId),
    ])
    expect(results[0].id).toBe(results[1].id)
    expect([firstImageId, secondImageId]).toContain(results[0].id)
    const loserId = results[0].id === firstImageId ? secondImageId : firstImageId
    expect(await getImageById(loserId)).toBeNull()
  })

  it('reuses the winner when failed-image replacements race', async () => {
    const bytes = Buffer.from(`replacement race ${randomBytes(16).toString('hex')}`)
    const hash = createHash('sha256').update(bytes).digest()
    const failedImageId = await insertPendingTestImage(user.id)
    await setImageHashAndProcessing(failedImageId, hash)
    await updateImageStatus(failedImageId, 'failed')
    const incomingIds = await Promise.all([
      insertPendingTestImage(user.id),
      insertPendingTestImage(user.id),
    ])
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockImplementation(
      async () =>
        ({
          Body: Readable.from([bytes]),
        }) as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>,
    )

    const replacements = await Promise.all(
      incomingIds.map(imageId => completeImageUpload(user, imageId)),
    )

    expect(replacements[0].id).toBe(replacements[1].id)
    expect(incomingIds).toContain(replacements[0].id)
    expect(await getImageById(failedImageId)).toBeNull()
    const loserId = incomingIds.find(id => id !== replacements[0].id)
    expect(loserId && (await getImageById(loserId))).toBeNull()
  })
})
