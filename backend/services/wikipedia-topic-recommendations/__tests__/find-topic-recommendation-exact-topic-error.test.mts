import { describe, expect, it, vi } from 'vitest'
import type { QueryOptions } from '@data-stores/psql/types'
import type { Topic } from '@voucha/types/entities/topic'

describe('findTopicRecommendationDuplicates (getTopicByAny error propagation)', () => {
  it('propagates non-422 errors thrown by getTopicByAny', async () => {
    const { findTopicRecommendationDuplicates } =
      await import('../find-topic-recommendation-duplicates.mts')
    const dbError = Object.assign(new Error('connection refused'), { status: 500 })
    const mockGetTopicByAny = vi
      .fn<(idOrSlug: string, options?: QueryOptions) => Promise<Topic | null>>()
      .mockRejectedValue(dbError)

    const random = `non-422-error-${Date.now()}`
    await expect(
      findTopicRecommendationDuplicates(
        {
          topic_title: `Non 422 Error Topic ${random}`,
          topic_slug: `non-422-error-topic-${random}`,
        },
        {},
        {
          getTopicByAny: mockGetTopicByAny,
          toolsSearchTopicsSemantic: vi.fn<
            (
              query: string,
              limit: number,
            ) => Promise<Array<{ id: string; name: string; slug: string; topic_type: string }>>
          >(async () => []),
        },
      ),
    ).rejects.toThrow('connection refused')
  })
})
