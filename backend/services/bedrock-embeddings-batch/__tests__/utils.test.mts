import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { processBatchCreation, processImageBatchCreation } from '../utils.mts'

const mocks = vi.hoisted(() => ({
  getBatchCreationLimits: vi.fn<VitestLooseMock>(),
  createBatch: vi.fn<VitestLooseMock>(),
}))

const captureException = sentryCaptureExceptionMock

const dependencies = {
  getBatchCreationLimits: mocks.getBatchCreationLimits,
  createBatch: mocks.createBatch,
}

describe('utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getBatchCreationLimits.mockResolvedValue({
      allowed: true,
      maxRecords: 10,
      maxSizeMB: 1,
      minRecords: 3,
    })
    mocks.createBatch.mockResolvedValue(undefined)
  })

  describe('processBatchCreation', () => {
    it('defers (returns null) when undersized and never submits a batch', async () => {
      const result = await processBatchCreation(
        {
          jobType: 'topics',
          streamPending: () =>
            streamEntities([
              { id: 'topic-1', content: 'a', content_sha256: hexBuf('a') },
              { id: 'topic-2', content: 'b', content_sha256: hexBuf('b') },
            ]),
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toBeNull()
      expect(mocks.createBatch).not.toHaveBeenCalled()
      expect(captureException).not.toHaveBeenCalled()
    })

    it('defers (returns null) when the stream is empty', async () => {
      const result = await processBatchCreation(
        {
          jobType: 'crawl_chunks',
          streamPending: () => streamEntities([]),
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toBeNull()
      expect(mocks.createBatch).not.toHaveBeenCalled()
      expect(captureException).not.toHaveBeenCalled()
    })

    it('creates a batch when entity count meets the minimum', async () => {
      const result = await processBatchCreation(
        {
          jobType: 'posts',
          streamPending: () =>
            streamEntities([
              { id: 'post-1', content: 'a', content_sha256: hexBuf('a') },
              { id: 'post-2', content: 'b', content_sha256: hexBuf('b') },
              { id: 'post-3', content: 'c', content_sha256: hexBuf('c') },
            ]),
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toEqual({ success: true })
      expect(mocks.createBatch).toHaveBeenCalledTimes(1)
      expect(captureException).not.toHaveBeenCalled()
    })

    it('re-enqueues itself when batch creation limits disallow new batches', async () => {
      mocks.getBatchCreationLimits.mockResolvedValueOnce({
        allowed: false,
        reason: 'inflight_job_limit_exceeded',
      })
      const reEnqueue = vi.fn<VitestLooseMock>()

      const result = await processBatchCreation(
        {
          jobType: 'topics',
          streamPending: () => streamEntities([]),
          reEnqueue,
        },
        dependencies,
      )

      expect(result).toEqual({ reEnqueued: true, reason: 'inflight_job_limit_exceeded' })
      expect(reEnqueue).toHaveBeenCalledTimes(1)
      expect(mocks.createBatch).not.toHaveBeenCalled()
    })

    it('runs copyExisting before consulting batch creation limits', async () => {
      const copyExisting = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

      const result = await processBatchCreation(
        {
          jobType: 'topics',
          streamPending: () => streamEntities([]),
          copyExisting,
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toBeNull()
      expect(copyExisting).toHaveBeenCalledTimes(1)
      const copyOrder = copyExisting.mock.invocationCallOrder[0]
      const limitsOrder = mocks.getBatchCreationLimits.mock.invocationCallOrder[0]
      expect(copyOrder).toBeLessThan(limitsOrder)
    })
  })

  describe('processImageBatchCreation', () => {
    it('returns explicit failure when all pending images fail before batch file creation', async () => {
      const result = await processImageBatchCreation(
        {
          streamPending: () => streamImages([{ id: 'image-1' }, { id: 'image-2' }]),
          addImageToBatch: () => Promise.reject(new Error('preprocess failed')),
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toEqual({
        failed: true,
        reason: 'Failed to add 2/2 images to Bedrock batch input',
        attempted: 2,
      })
      expect(mocks.createBatch).not.toHaveBeenCalled()
      expect(captureException).toHaveBeenCalledTimes(3)
    })

    it('returns null without creating an undersized image batch', async () => {
      const result = await processImageBatchCreation(
        {
          streamPending: () => streamImages([{ id: 'image-1' }, { id: 'image-2' }]),
          addImageToBatch: (fileBuilder, image, maxSizeMB) =>
            fileBuilder.addImageIfFits(
              {
                entity_id: image.id,
                image_sha_256: Buffer.from('0'.repeat(64), 'hex'),
                format: 'jpeg',
                bytes: 'YWJj',
              },
              maxSizeMB,
            ),
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toBeNull()
      expect(mocks.createBatch).not.toHaveBeenCalled()
      expect(captureException).not.toHaveBeenCalled()
    })

    it('skips and reports failures for images with a non-public URL origin', async () => {
      // addImageToBatch throws (as getPublicImageUrl returns null) → processImageBatchCreation
      // catches via onError and continues; with all images failing and none added, returns a
      // failure summary rather than null.
      const result = await processImageBatchCreation(
        {
          streamPending: () => streamImages([{ id: 'image-1' }, { id: 'image-2' }]),
          addImageToBatch: () =>
            Promise.reject(new Error('Refusing to fetch non-public image URL for image image-1')),
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toEqual({
        failed: true,
        reason: 'Failed to add 2/2 images to Bedrock batch input',
        attempted: 2,
      })
      expect(mocks.createBatch).not.toHaveBeenCalled()
      expect(captureException).toHaveBeenCalledTimes(3) // 2 per-image errors + 1 aggregate
    })

    it('creates an image batch when image count meets the minimum', async () => {
      const result = await processImageBatchCreation(
        {
          streamPending: () =>
            streamImages([{ id: 'image-1' }, { id: 'image-2' }, { id: 'image-3' }]),
          addImageToBatch: (fileBuilder, image, maxSizeMB) =>
            fileBuilder.addImageIfFits(
              {
                entity_id: image.id,
                image_sha_256: Buffer.from('1'.repeat(64), 'hex'),
                format: 'jpeg',
                bytes: 'YWJj',
              },
              maxSizeMB,
            ),
          reEnqueue: vi.fn<VitestLooseMock>(),
        },
        dependencies,
      )

      expect(result).toEqual({ success: true })
      expect(mocks.createBatch).toHaveBeenCalledWith(
        expect.any(String),
        'images',
        3,
        expect.any(String),
        expect.objectContaining({ inputSizeMB: expect.any(Number) }),
      )
    })
  })

  async function* streamEntities(
    entities: Array<{ id: string; content: string; content_sha256: Buffer }>,
  ): AsyncGenerator<{ id: string; content: string; content_sha256: Buffer }> {
    for (const entity of entities) {
      yield entity
    }
  }

  async function* streamImages(images: Array<{ id: string }>): AsyncGenerator<{ id: string }> {
    for (const image of images) {
      yield image
    }
  }

  function hexBuf(letter: string): Buffer {
    return Buffer.from(letter.repeat(64), 'hex')
  }
})
