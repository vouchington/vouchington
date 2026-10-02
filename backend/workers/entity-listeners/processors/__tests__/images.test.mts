import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as staydownMatches from '@services/copyright-notices/staydown-matches'
import * as enqueueModule from '@queues/openai-moderation/enqueues'

describe('image entity listener processor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues image moderation and staydown matching for created images', async () => {
    const enqueueCreateImageModeration = vi
      .spyOn(enqueueModule, 'enqueueCreateImageModeration')
      .mockResolvedValue(undefined as never)
    const enqueueStaydownMatch = vi
      .spyOn(staydownMatches, 'enqueueCopyrightStaydownUploadMatch')
      .mockResolvedValue(undefined)
    const { processImageCreated } = await import('../images.mts')

    await processImageCreated({ id: 'image-1' })

    expect(enqueueCreateImageModeration).toHaveBeenCalledWith('image-1')
    expect(enqueueStaydownMatch).toHaveBeenCalledWith('image-1')
  })
})
