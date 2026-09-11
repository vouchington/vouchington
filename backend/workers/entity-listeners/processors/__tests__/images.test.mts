import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as enqueueModule from '@queues/openai-moderation/enqueues'

describe('image entity listener processor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues image moderation for created images', async () => {
    const enqueueCreateImageModeration = vi
      .spyOn(enqueueModule, 'enqueueCreateImageModeration')
      .mockResolvedValue(undefined as never)
    const { processImageCreated } = await import('../images.mts')

    processImageCreated({ id: 'image-1' })

    expect(enqueueCreateImageModeration).toHaveBeenCalledWith('image-1')
  })
})
