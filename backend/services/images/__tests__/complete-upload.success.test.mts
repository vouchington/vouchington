import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createImageUploadUrl } from '../create-upload-url.mts'
import { completeImageUpload } from '../complete-upload.mts'
import { deleteImageById } from '../delete.mts'
import { getImageById } from '../get.mts'
import { deriveUploadStatus } from '../get-upload-state.mts'
import { imagesQueue } from '@queues/images/queues'

import * as s3Module from '../s3-upload-lifecycle.mts'
import * as finalS3 from '../s3.mts'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { deepStrictEqual } from 'node:assert'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('completeImageUpload - success path', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await imagesQueue.obliterate({ force: true })
    vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3').mockResolvedValue()
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

  it('persists the immutable digest key before enqueueing metadata', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const bytes = Buffer.from(`digest key ${randomBytes(16).toString('hex')}`)
    const digestKey = createHash('sha256').update(bytes).digest('hex')
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([bytes]),
      ContentType: 'image/jpeg',
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)

    const result = await completeImageUpload(user, image_id)

    expect(result.s3_key).toBe(digestKey)
    expect(s3Module.ensureImageDeliveryAliasInS3).toHaveBeenCalledWith(
      image_id,
      expect.objectContaining({ sha256: expect.any(Buffer) }),
    )
    const job = (await imagesQueue.getJobs('waiting')).find(
      queued => (queued.data as { id?: string }).id === image_id,
    )
    expect(job?.data).toEqual({ id: image_id })
  })

  it('keeps deletion evidence null when staging-source deletion fails after promotion', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const bytes = Buffer.from(`source deletion retry ${randomBytes(16).toString('hex')}`)
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([bytes]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    vi.mocked(s3Module.deleteImageUploadSourceFromS3).mockRejectedValueOnce(
      new Error('staging delete failed'),
    )

    await expect(completeImageUpload(user, image_id)).resolves.toMatchObject({ id: image_id })

    const image = await getImageById(image_id)
    expect(image?.s3_key).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(image?.upload_source_deleted_at).toBeNull()
  })

  it('returns the promoted image when metadata enqueueing fails', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const bytes = Buffer.from(`metadata enqueue ${randomBytes(16).toString('hex')}`)
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([bytes]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    vi.spyOn(imagesQueue, 'add').mockRejectedValueOnce(new Error('queue unavailable'))

    const result = await completeImageUpload(user, image_id)

    expect(result.s3_key).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect((await getImageById(image_id))?.s3_key).toBe(result.s3_key)
  })

  it('promotes the frozen body rather than a later staging mutation', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/png',
      contentLength: 1024,
    })
    const original = Buffer.from(`original ${randomBytes(16).toString('hex')}`)
    const expected = Buffer.from(original)
    async function* mutableSource() {
      yield original
      original.fill(0)
    }
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      $metadata: {},
      Body: mutableSource(),
      ContentType: 'image/png',
    } as unknown as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    const promote = vi
      .spyOn(s3Module, 'promoteFrozenImageToS3')
      .mockImplementation(async ({ filename, sha256 }) => {
        expect(await readFile(filename)).toEqual(expected)
        return { created: true, s3Key: sha256.toString('hex') }
      })

    await completeImageUpload(user, image_id)

    expect(promote).toHaveBeenCalledOnce()
    expect(original).not.toEqual(expected)
  })

  it('does not resurrect an image deleted while immutable promotion is in flight', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    const bytes = Buffer.from(`delete race ${randomBytes(16).toString('hex')}`)
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([bytes]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)
    let releasePromotion!: () => void
    let promotionStarted!: () => void
    const started = new Promise<void>(resolve => (promotionStarted = resolve))
    const release = new Promise<void>(resolve => (releasePromotion = resolve))
    vi.spyOn(s3Module, 'promoteFrozenImageToS3').mockImplementation(async ({ sha256 }) => {
      promotionStarted()
      await release
      return { created: true, s3Key: sha256.toString('hex') }
    })
    vi.spyOn(s3Module, 'deleteKnownImageStorageFromS3').mockResolvedValue()
    const deletePromoted = vi.spyOn(finalS3, 'deleteImagesFromS3').mockResolvedValue()

    const completion = completeImageUpload(user, image_id)
    void completion.catch(() => {})
    await started
    await deleteImageById(image_id, true)
    releasePromotion()

    await expect(completion).rejects.toMatchObject({ status: 409 })
    expect(await getImageById(image_id)).toBeNull()
    expect(deletePromoted).toHaveBeenCalledWith([
      { s3_key: createHash('sha256').update(bytes).digest('hex') },
      { s3_key: image_id },
    ])
  })

  it('returns processing image and enqueues metadata extraction', async () => {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    // Mock S3 response with unique data per test run
    const mockImageData = Buffer.from(`fake image data ${randomBytes(16).toString('hex')}`)
    const mockStream = Readable.from([mockImageData])
    const getFromS3Spy = vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: mockStream,
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)

    const mockHash = createHash('sha256').update(mockImageData).digest()

    // Complete the upload — synchronous part of the flow
    const result = await completeImageUpload(user, image_id)

    // Verify the result reflects the processing handoff
    expect(result.id).toBe(image_id)
    expect(deriveUploadStatus(result)).toBe('processing')
    expect(Buffer.from(result.sha_256, 'hex')).toEqual(mockHash)

    // Verify S3 was called
    expect(getFromS3Spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: image_id, upload_staged_at: expect.any(Date) }),
    )

    // Verify metadata extraction was enqueued for the worker using the production options
    const queuedJob = (await imagesQueue.getJobs('waiting')).find(
      job => (job.data as { id?: string }).id === image_id,
    )
    expect(queuedJob).toMatchObject({
      name: 'extract-metadata',
      data: { id: image_id },
      opts: {
        priority: 5,
        deduplication: {
          id: `extract-image-metadata-${image_id}`,
          mode: 'simple',
        },
      },
    })

    // Verify database row reflects processing + persisted hash
    const updatedImage = await getImageById(image_id)
    expect(updatedImage && deriveUploadStatus(updatedImage)).toBe('processing')
    expect(Buffer.from(updatedImage?.sha_256 || '', 'hex')).toEqual(mockHash)
    expect(updatedImage?.upload_source_deleted_at).toBeInstanceOf(Date)
  })

  it('handles deduplication - return existing image if hash matches', async () => {
    // Create and complete first upload
    const { image_id: firstImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    // Use unique image data per test run to avoid cross-test deduplication
    const mockImageData = Buffer.from(`fake image data ${randomBytes(16).toString('hex')}`)

    // Mock for first upload
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([mockImageData]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)

    const firstResult = await completeImageUpload(user, firstImageId)

    // First upload is now in processing state with the persisted hash
    expect(deriveUploadStatus(firstResult)).toBe('processing')

    // Create second upload with same content
    const { image_id: secondImageId } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })

    // Mock S3 delete for duplicate
    const deleteFromS3Spy = vi.spyOn(s3Module, 'deleteImageUploadSourceFromS3')

    // Mock same hash for second upload
    vi.spyOn(s3Module, 'getImageUploadSourceFromS3').mockResolvedValue({
      Body: Readable.from([mockImageData]),
    } as Awaited<ReturnType<typeof s3Module.getImageUploadSourceFromS3>>)

    // Complete second upload - should return first image
    const secondResult = await completeImageUpload(user, secondImageId)

    // Should return the first image because hash matched
    expect(secondResult.id).toBe(firstResult.id)

    // Verify S3 object for duplicate was deleted
    expect(deleteFromS3Spy).toHaveBeenCalledWith(expect.objectContaining({ id: secondImageId }))

    // Verify second image was deleted from database
    const deletedImage = await getImageById(secondImageId)
    expect(deletedImage).toBeNull()
  })
})
