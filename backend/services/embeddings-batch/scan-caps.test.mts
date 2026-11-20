import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestImage } from '@voucha/test-helpers'
import type { EmbeddingScanCursor } from '@queues/gemini-embeddings-batch/types'
import { streamPendingImages } from './entities/images.mts'

describe('bounded Vertex image scans', () => {
  it('finishes a replay-only page at its row cap before reading fresh images', async () => {
    const owner = await createTestUser()
    const ids = [await insertTestImage(owner.id), await insertTestImage(owner.id)]
    let progress: { hasMore: boolean; cursor?: EmbeddingScanCursor } = { hasMore: false }
    const run = async (cursor: EmbeddingScanCursor) => {
      const seen: string[] = []
      for await (const image of streamPendingImages({
        cursor,
        limits: { batchSize: 1, maxRows: 1 },
        onComplete: result => {
          progress = result
        },
      }))
        seen.push(image.id)
      return seen
    }
    const cursor: EmbeddingScanCursor = {
      sweepStartedAt: new Date(Date.now() + 1000).toISOString(),
      afterId: '00000000-0000-7000-8000-000000000001',
      pendingImageIds: ids,
    }
    expect(await run(cursor)).toEqual([ids[1]])
    expect(progress).toMatchObject({ hasMore: true, cursor: { pendingImageIds: [ids[0]] } })
    expect(await run(progress.cursor!)).toEqual([ids[0]])
    expect(progress).toMatchObject({ hasMore: true, cursor: { pendingImageIds: [] } })
    expect(await run(progress.cursor!)).toEqual([])
    expect(progress.hasMore).toBe(false)
  })
})
