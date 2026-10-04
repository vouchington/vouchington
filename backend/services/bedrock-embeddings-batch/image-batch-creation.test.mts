import { describe, expect, it, vi } from 'vitest'
import { processImageBatchCreation } from './image-batch-creation.mts'
import { getBatchCreationLimits } from './rate-limits.mts'
import { createBatch } from './orchestrator/create.mts'
import { addImageToBatch, streamPendingImages } from './entities/images.mts'
import { getEmbeddingCreationRetryDelayMs } from '@services/bedrock-embeddings/batch/config'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'

describe('minimum image capacity', () => {
  it('retains healthy and non-fitting IDs when cloud submission fails', async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    const cursor = { sweepStartedAt: new Date().toISOString(), afterId: ids[1] }
    const reEnqueue = vi.fn<(cursor?: EmbeddingScanCursor) => Promise<void>>(async () => {})
    const create = vi.fn<typeof createBatch>().mockRejectedValue(new Error('cloud unavailable'))
    await expect(
      processImageBatchCreation(
        {
          streamPending: async function* (options) {
            try {
              for (const id of ids) yield { id }
            } finally {
              options?.onComplete?.({ hasMore: true, cursor })
            }
          },
          addImageToBatch: (builder, image, maxSizeMB) =>
            image.id === ids[1]
              ? Promise.resolve(false)
              : builder.addImageIfFits(
                  {
                    entity_id: image.id,
                    image_sha_256: Buffer.alloc(32),
                    format: 'jpeg',
                    bytes: 'YWJj',
                  },
                  maxSizeMB,
                ),
          reEnqueue,
        },
        {
          getBatchCreationLimits: vi.fn<typeof getBatchCreationLimits>().mockResolvedValue({
            allowed: true,
            minRecords: 1,
            maxRecords: 3,
            maxSizeMB: 32,
          }),
          createBatch: create,
        },
      ),
    ).rejects.toThrow('cloud unavailable')
    expect(create).toHaveBeenCalledOnce()
    expect(reEnqueue).toHaveBeenCalledExactlyOnceWith({ ...cursor, pendingImageIds: ids })
  })

  it.each([
    { maxRecords: 2, maxSizeMB: 32 },
    { maxRecords: 10, maxSizeMB: 5 },
  ])(
    'delays the current partial continuation before scanning when capacity is insufficient: %j',
    async capacity => {
      const cursor = {
        sweepStartedAt: new Date().toISOString(),
        afterId: crypto.randomUUID(),
        pendingImageIds: [crypto.randomUUID()],
      }
      const streamPending = vi.fn<typeof streamPendingImages>()
      const reEnqueue = vi.fn<(cursor?: EmbeddingScanCursor, delayMs?: number) => Promise<void>>(
        async () => {},
      )
      expect(
        await processImageBatchCreation(
          { cursor, streamPending, addImageToBatch, reEnqueue },
          {
            getBatchCreationLimits: vi
              .fn<typeof getBatchCreationLimits>()
              .mockResolvedValue({ allowed: true, minRecords: 3, ...capacity }),
            createBatch: vi.fn<typeof createBatch>(),
          },
        ),
      ).toEqual({ reEnqueued: true, reason: 'minimum_image_capacity_unavailable', hasMore: true })
      expect(streamPending).not.toHaveBeenCalled()
      expect(reEnqueue).toHaveBeenCalledExactlyOnceWith(cursor, getEmbeddingCreationRetryDelayMs())
    },
  )
})
