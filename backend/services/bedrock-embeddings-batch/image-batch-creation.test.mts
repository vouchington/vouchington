import { processBatchCreation } from './utils.mts'
import { minimumTextBatchSizeMB } from '@services/bedrock-embeddings/batch/input-size-limits'
import { describe, expect, it, vi } from 'vitest'
import { processImageBatchCreation } from './image-batch-creation.mts'
import { getBatchCreationLimits } from './rate-limits.mts'
import { createBatch } from './orchestrator/create.mts'
import { addImageToBatch, streamPendingImages } from './entities/images.mts'
import { getEmbeddingCreationRetryDelayMs } from '@services/bedrock-embeddings/batch/config'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'

describe('minimum image capacity', () => {
  it('leaves cloud-failure retry to the current job without spawning a continuation', async () => {
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
    expect(reEnqueue).not.toHaveBeenCalled()
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

describe('text batch capacity and failure', () => {
  it('delays the same cursor before scanning when escaped minimum records cannot fit', async () => {
    const cursor = { sweepStartedAt: new Date().toISOString(), afterId: crypto.randomUUID() }
    const streamPending =
      vi.fn<() => AsyncGenerator<{ id: string; content: string; content_sha256: Buffer }>>()
    const reEnqueue = vi.fn<(cursor?: EmbeddingScanCursor, delayMs?: number) => Promise<void>>(
      async () => {},
    )
    const result = await processBatchCreation(
      { jobType: 'topics', cursor, streamPending, reEnqueue },
      {
        getBatchCreationLimits: vi.fn<typeof getBatchCreationLimits>().mockResolvedValue({
          allowed: true,
          minRecords: 3,
          maxRecords: 10,
          maxSizeMB: minimumTextBatchSizeMB(3) / 2,
        }),
        createBatch: vi.fn<typeof createBatch>(),
      },
    )
    expect(result).toEqual({
      reEnqueued: true,
      reason: 'minimum_text_capacity_unavailable',
      hasMore: true,
    })
    expect(streamPending).not.toHaveBeenCalled()
    expect(reEnqueue).toHaveBeenCalledExactlyOnceWith(cursor, getEmbeddingCreationRetryDelayMs())
  })

  it('does not enqueue another text scan when the current job must retry cloud submission', async () => {
    const id = crypto.randomUUID()
    const reEnqueue = vi.fn<(cursor?: EmbeddingScanCursor) => Promise<void>>(async () => {})
    await expect(
      processBatchCreation(
        {
          jobType: 'topics',
          reEnqueue,
          streamPending: async function* (options) {
            try {
              yield { id, content: 'text', content_sha256: Buffer.alloc(32) }
            } finally {
              options?.onComplete?.({
                hasMore: true,
                cursor: { sweepStartedAt: new Date().toISOString(), afterId: id },
              })
            }
          },
        },
        {
          getBatchCreationLimits: vi
            .fn<typeof getBatchCreationLimits>()
            .mockResolvedValue({ allowed: true, minRecords: 1, maxRecords: 10, maxSizeMB: 32 }),
          createBatch: vi
            .fn<typeof createBatch>()
            .mockRejectedValue(new Error('cloud unavailable')),
        },
      ),
    ).rejects.toThrow('cloud unavailable')
    expect(reEnqueue).not.toHaveBeenCalled()
  })
})
