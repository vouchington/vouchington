import { beforeEach, describe, expect, it, vi } from 'vitest'

import { processDispatchDispatcher } from './processors.mts'
import type { getRecentContentIds } from '@services/wikipedia-topic-recommendations/database'
import type { enqueueBulkWikipediaRecommender } from '@queues/ai-agents/enqueues/wikipedia-recommender'

const mockGetRecentContentIds = vi.fn<typeof getRecentContentIds>()
const mockEnqueueBulkWikipediaRecommender = vi.fn<typeof enqueueBulkWikipediaRecommender>()

describe('wikipedia recommender dispatcher processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enqueues ai-agent recommender batches for recent posts', async () => {
    mockGetRecentContentIds.mockResolvedValue({ postIds: ['post-1', 'post-2'] })

    await processDispatchDispatcher(
      { scheduled_at: '2026-05-23T00:00:00.000Z' },
      {
        enqueueBulkWikipediaRecommender: mockEnqueueBulkWikipediaRecommender,
        getRecentContentIds: mockGetRecentContentIds,
      },
    )

    expect(mockEnqueueBulkWikipediaRecommender).toHaveBeenCalledWith([
      { entityType: 'post', entityIds: ['post-1', 'post-2'] },
    ])
  })
})
