import { afterEach, beforeEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { randomBytes } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import {
  setImageHashAndProcessing,
  setImageCompleteWithData,
  markImageDeleted,
  updateImageStatus,
} from '@voucha/test-helpers/entities/images'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { getImageById } from '@services/images/get'
import { deriveUploadStatus } from '@services/images/get-upload-state'
import {
  processExtractImageMetadata,
  type ProcessExtractImageMetadataDeps,
} from './extract-metadata.mts'
import * as presignModule from '@services/images/presign-upload-url'
import type { PrivateUser } from '@services/users/types'

let user: PrivateUser

function createAsyncVoidMock() {
  return vi.fn<() => Promise<void>>(async () => undefined)
}

function createPublishImageStateMock() {
  return vi.fn<(imageId: string, state: Record<string, unknown>) => Promise<void>>(
    async () => undefined,
  )
}

function createGetImageFromS3Mock(body?: AsyncIterable<Uint8Array>) {
  return vi.fn<ProcessExtractImageMetadataDeps['getImageFromS3']>(async () => ({
    $metadata: {},
    Body: (body ?? Readable.from([Buffer.from('fake-bytes')])) as never,
  }))
}

function createSharpMock(metadata: Record<string, unknown>) {
  return vi.fn<(filename: string) => { metadata: () => Promise<Record<string, unknown>> }>(() => ({
    metadata: vi.fn<() => Promise<Record<string, unknown>>>(async () => metadata),
  }))
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
    vi.useRealTimers()
  })

  async function createProcessingImage(): Promise<string> {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await setImageHashAndProcessing(image_id, randomBytes(32))
    return image_id
  }

  function makeDeps(overrides?: Partial<ProcessExtractImageMetadataDeps>) {
    return {
      getImageFromS3: overrides?.getImageFromS3 ?? createGetImageFromS3Mock(),
      getDeployEnvironment:
        overrides?.getDeployEnvironment ??
        vi.fn<ProcessExtractImageMetadataDeps['getDeployEnvironment']>(() => 'test'),
      publishImageState: overrides?.publishImageState ?? createPublishImageStateMock(),
      enqueueOnImageCreated: overrides?.enqueueOnImageCreated ?? createAsyncVoidMock(),
      createSharp:
        overrides?.createSharp ?? createSharpMock({ format: 'jpeg', width: 1920, height: 1080 }),
      onError: overrides?.onError ?? vi.fn<(error: Error) => void>(),
    }
  }

  describe('processExtractImageMetadata', () => {
    it('finalizes image to complete and enqueues onImageCreated', async () => {
      const image_id = await createProcessingImage()
      const enqueueOnImageCreated = createAsyncVoidMock()
      const publishImageState = createPublishImageStateMock()

      await processExtractImageMetadata(image_id, {
        ...makeDeps({ enqueueOnImageCreated, publishImageState }),
      })

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('complete')
      expect(updated?.data).toMatchObject({ format: 'jpeg', width: 1920, height: 1080 })
      expect(updated?.upload_completed_at).toBeDefined()
      expect(enqueueOnImageCreated).toHaveBeenCalledWith(image_id)
      expect(publishImageState).toHaveBeenCalledWith(image_id, {
        id: image_id,
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: false,
      })
    })

    it('does not mark upload failed when onImageCreated enqueue fails after finalize', async () => {
      const image_id = await createProcessingImage()
      const processingImage = await getImageById(image_id)
      const onError = vi.fn<(error: Error) => void>()
      const enqueueOnImageCreated = vi.fn<() => Promise<void>>(async () => {
        throw new Error('queue unavailable')
      })

      await processExtractImageMetadata(image_id, {
        ...makeDeps({ enqueueOnImageCreated, onError }),
      })

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('complete')
      expect(updated?.upload_error).toBeNull()
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'queue unavailable',
          tags: { imageId: image_id },
          extra: expect.objectContaining({
            context: 'extractImageMetadata.enqueueOnImageCreated',
            s3Key: processingImage?.s3_key,
          }),
        }),
      )
    })

    it('marks image as failed when sharp returns unsupported format', async () => {
      const image_id = await createProcessingImage()
      const createSharp = createSharpMock({ format: 'bmp', width: 100, height: 100 })

      await expect(
        processExtractImageMetadata(image_id, {
          ...makeDeps({ createSharp }),
        }),
      ).rejects.toMatchObject({
        status: 415,
      })

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
      expect(updated?.upload_error).toContain('Unsupported format')
    })

    it('no-ops when image is already complete', async () => {
      const { image_id } = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await setImageCompleteWithData(image_id, randomBytes(32), { format: 'jpeg' })

      const getImageFromS3 = createGetImageFromS3Mock()

      await processExtractImageMetadata(image_id, {
        ...makeDeps({ getImageFromS3 }),
      })

      expect(getImageFromS3).not.toHaveBeenCalled()
    })

    it('no-ops gracefully when image record is missing', async () => {
      const missingId = '00000000-0000-0000-0000-000000000000'
      const getImageFromS3 = createGetImageFromS3Mock()

      await processExtractImageMetadata(missingId, {
        ...makeDeps({ getImageFromS3 }),
      })

      expect(getImageFromS3).not.toHaveBeenCalled()
    })

    it('no-ops when a queued metadata job replays after image deletion', async () => {
      const imageId = await createProcessingImage()
      await markImageDeleted(imageId)
      const getImageFromS3 = createGetImageFromS3Mock()

      await processExtractImageMetadata(imageId, {
        ...makeDeps({ getImageFromS3 }),
      })

      expect(getImageFromS3).not.toHaveBeenCalled()
    })

    it('throws unrecoverable when image is in unexpected status', async () => {
      const { image_id } = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await updateImageStatus(image_id, 'pending')

      await expect(processExtractImageMetadata(image_id, makeDeps())).rejects.toThrow(
        /Cannot extract metadata/,
      )
    })

    it('terminalizes a processing row without an immutable final key', async () => {
      const { image_id } = await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      })
      await updateImageStatus(image_id, 'processing')
      const unrecoverable = vi.fn<ProcessExtractImageMetadataDeps['unrecoverable']>(error => {
        throw error
      })

      await expect(
        processExtractImageMetadata(image_id, {
          ...makeDeps(),
          unrecoverable,
        }),
      ).rejects.toThrow(/does not have an immutable final S3 key/)

      expect(unrecoverable).toHaveBeenCalledOnce()
      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
    })

    it('skips finalize when row already transitioned out of processing', async () => {
      const image_id = await createProcessingImage()
      const getImageFromS3 = createGetImageFromS3Mock()
      const createSharp = vi.fn<
        (filename: string) => { metadata: () => Promise<Record<string, unknown>> }
      >(() => ({
        metadata: async () => {
          await updateImageStatus(image_id, 'failed')
          return { format: 'jpeg', width: 1920, height: 1080 }
        },
      }))
      const enqueueOnImageCreated = createAsyncVoidMock()

      await processExtractImageMetadata(image_id, {
        ...makeDeps({
          getImageFromS3,
          createSharp,
          enqueueOnImageCreated,
        }),
      })

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
      expect(enqueueOnImageCreated).not.toHaveBeenCalled()
    })

    it('marks image as failed when S3 body is empty', async () => {
      const image_id = await createProcessingImage()
      const getImageFromS3 = vi.fn<ProcessExtractImageMetadataDeps['getImageFromS3']>(async () => ({
        $metadata: {},
        Body: undefined,
      }))

      await expect(
        processExtractImageMetadata(image_id, {
          ...makeDeps({ getImageFromS3 }),
        }),
      ).rejects.toThrow(/S3 response body is empty/)

      const updated = await getImageById(image_id)
      expect(updated && deriveUploadStatus(updated)).toBe('failed')
    })
  })
})
