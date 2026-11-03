import { afterEach, beforeEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import { createTestUser } from '@voucha/test-helpers'
import {
  setImageHashAndProcessing,
  setImageCompleteWithData,
  markImageDeleted,
  updateImageStatus,
} from '@voucha/test-helpers/entities/images'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageById } from '@services/images/get'
import { deriveUploadStatus } from '@services/images/get-upload-state'
import * as imageStorage from '@services/images/s3'
import * as presignModule from '@services/images/presign-upload-url'
import type { PrivateUser } from '@services/users/types'
import { processExtractImageMetadata } from './extract-metadata.mts'

let user: PrivateUser

const COMPLETE_STATE = {
  upload_status: 'complete',
  upload_error: null,
  ready: false,
  blocked: false,
} as const

async function createJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 32, channels: 3, background: '#808080' } })
    .jpeg()
    .toBuffer()
}

/** S3 holds `bytes` for every key; the returned spy records each read. */
function storeInS3(bytes: Buffer | undefined) {
  return vi.spyOn(imageStorage, 'getImageFromS3').mockImplementation(async () => ({
    $metadata: {},
    Body: bytes ? (Readable.from([bytes]) as never) : undefined,
  }))
}

function watchPublishedStates() {
  return vi.spyOn(imageStatePubSub, 'publish').mockResolvedValue(undefined as never)
}

async function readImageCreatedJobs(imageId: string) {
  return (await readAllQueueJobs(backgroundQueue))
    .filter(
      job =>
        job.name.endsWith('processImageCreated') && (job.data as { id?: string }).id === imageId,
    )
    .map(job => job.data)
}

describe('extract-metadata', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(presignModule, 'presignImageUploadUrl').mockResolvedValue(
      'https://images.example.test/fake-signature',
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function createProcessingImage(): Promise<string> {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await setImageHashAndProcessing(image_id, randomBytes(32))
    return image_id
  }

  describe('processExtractImageMetadata', () => {
    it('finalizes image to complete, publishes it, and enqueues onImageCreated', async () => {
      const image_id = await createProcessingImage()
      const getImageFromS3 = storeInS3(await createJpeg())
      const publish = watchPublishedStates()

      await processExtractImageMetadata(image_id)

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('complete')
      expect(updated?.data).toMatchObject({ format: 'jpeg', width: 64, height: 32 })
      expect(updated?.upload_completed_at).toBeDefined()
      expect(getImageFromS3).toHaveBeenCalledExactlyOnceWith('test', updated?.s3_key)
      expect(await readImageCreatedJobs(image_id)).toEqual([{ id: image_id }])
      expect(publish).toHaveBeenCalledExactlyOnceWith(image_id, { id: image_id, ...COMPLETE_STATE })
    })

    it('does not mark upload failed when onImageCreated enqueue fails after finalize', async () => {
      const image_id = await createProcessingImage()
      const processingImage = await getImageById(image_id)
      storeInS3(await createJpeg())
      watchPublishedStates()
      const add = backgroundQueue.add
      vi.spyOn(backgroundQueue, 'add').mockImplementation((name, data, ...rest) => {
        if (name.endsWith('processImageCreated') && (data as { id?: string }).id === image_id)
          return Promise.reject(new Error('queue unavailable'))
        return add.call(backgroundQueue, name, data, ...rest)
      })

      await processExtractImageMetadata(image_id)

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('complete')
      expect(updated?.upload_error).toBeNull()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'queue unavailable' }),
        {
          tags: { imageId: image_id },
          extra: {
            context: 'extractImageMetadata.enqueueOnImageCreated',
            s3Key: processingImage?.s3_key,
          },
        },
      )
    })

    it('marks image as failed when the stored format is unsupported', async () => {
      const image_id = await createProcessingImage()
      storeInS3(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))
      const publish = watchPublishedStates()

      await expect(processExtractImageMetadata(image_id)).rejects.toMatchObject({
        status: 415,
        message: 'Unsupported format: svg',
      })

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
      expect(updated?.upload_error).toBe('Unsupported format: svg')
      expect(publish).toHaveBeenCalledExactlyOnceWith(image_id, {
        id: image_id,
        upload_status: 'failed',
        upload_error: 'Unsupported format: svg',
        ready: false,
        blocked: false,
      })
      expect(await readImageCreatedJobs(image_id)).toEqual([])
    })

    it('marks image as failed when the stored bytes are not an image', async () => {
      const image_id = await createProcessingImage()
      storeInS3(Buffer.from('not an image'))
      watchPublishedStates()

      await expect(processExtractImageMetadata(image_id)).rejects.toBeInstanceOf(Error)

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
      expect(updated?.upload_error).toBeTruthy()
      expect(await readImageCreatedJobs(image_id)).toEqual([])
    })

    it('no-ops when image is already complete', async () => {
      const { image_id } = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await setImageCompleteWithData(image_id, randomBytes(32), { format: 'jpeg' })
      const getImageFromS3 = storeInS3(await createJpeg())

      await processExtractImageMetadata(image_id)

      expect(getImageFromS3).not.toHaveBeenCalled()
    })

    it('no-ops gracefully when image record is missing', async () => {
      const getImageFromS3 = storeInS3(await createJpeg())

      await processExtractImageMetadata('00000000-0000-0000-0000-000000000000')

      expect(getImageFromS3).not.toHaveBeenCalled()
    })

    it('no-ops when a queued metadata job replays after image deletion', async () => {
      const imageId = await createProcessingImage()
      await markImageDeleted(imageId)
      const getImageFromS3 = storeInS3(await createJpeg())

      await processExtractImageMetadata(imageId)

      expect(getImageFromS3).not.toHaveBeenCalled()
    })

    it('throws unrecoverable when image is in unexpected status', async () => {
      const { image_id } = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await updateImageStatus(image_id, 'pending')

      await expect(processExtractImageMetadata(image_id)).rejects.toThrow(/Cannot extract metadata/)
    })

    it('terminalizes a processing row without an immutable final key', async () => {
      const { image_id } = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await updateImageStatus(image_id, 'processing')
      const getImageFromS3 = storeInS3(await createJpeg())
      watchPublishedStates()

      await expect(processExtractImageMetadata(image_id)).rejects.toThrow(
        /does not have an immutable final S3 key/,
      )

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
      expect(getImageFromS3).not.toHaveBeenCalled()
    })

    it('skips finalize when row already transitioned out of processing', async () => {
      const image_id = await createProcessingImage()
      const bytes = await createJpeg()
      vi.spyOn(imageStorage, 'getImageFromS3').mockImplementation(async () => {
        await updateImageStatus(image_id, 'failed')
        return { $metadata: {}, Body: Readable.from([bytes]) as never }
      })
      const publish = watchPublishedStates()

      await processExtractImageMetadata(image_id)

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
      expect(await readImageCreatedJobs(image_id)).toEqual([])
      expect(publish).not.toHaveBeenCalled()
    })

    it('marks image as failed when S3 body is empty', async () => {
      const image_id = await createProcessingImage()
      storeInS3(undefined)
      watchPublishedStates()

      await expect(processExtractImageMetadata(image_id)).rejects.toThrow(
        /S3 response body is empty/,
      )

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
    })

    it('reports a failed-state publish that keeps failing after retries', async () => {
      const image_id = await createProcessingImage()
      storeInS3(undefined)
      const publishFailure = new Error('transient publish failure')
      const publish = vi.spyOn(imageStatePubSub, 'publish').mockRejectedValue(publishFailure)

      await expect(processExtractImageMetadata(image_id)).rejects.toThrow(
        /S3 response body is empty/,
      )

      expect(publish).toHaveBeenCalledTimes(3)
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(publishFailure, {})
    })
  })
})
