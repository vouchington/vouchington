import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getMyLandingPageCandidatesClient } from '@/lib/api/client'
import { makeLandingPageCandidatesResponse } from '@/test-helpers/api-responses/landing-pages'
import { useCandidatePages } from './use-candidate-pages'

vi.mock(
  import('@/lib/api/client'),
  () =>
    ({
      getMyLandingPageCandidatesClient: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('@/lib/api/client'),
)

const review = (id: string) => ({
  id,
  title: id,
  declared_language: null,
  lingua_rs_detected_language: null,
  slug: null,
  markdown: '',
  created_at: '',
  review_topic_ratings: [
    { topic_id: 'topic', topic_name: 'Topic', topic_slug: 'topic', rating: 5, order_index: 0 },
  ],
})
const first = makeLandingPageCandidatesResponse({
  candidates: { profile_links: [], reviews: [review('first')], referral_links: [] },
  page_info: { has_next_page: true, start_cursor: 'start', end_cursor: 'next' },
})

describe('candidate pagination', () => {
  it('retries failures without losing earlier candidates', async () => {
    const request = vi.mocked(getMyLandingPageCandidatesClient)
    request
      .mockReset()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ...first,
        candidates: { ...first.candidates, reviews: [review('first'), review('next')] },
        page_info: { has_next_page: false, start_cursor: 'next', end_cursor: 'end' },
      })
    const { result } = renderHook(() => useCandidatePages(first))
    expect(result.current.data.candidates.reviews.map(r => r.id)).toEqual(['first'])
    await act(() => result.current.loadMore())
    expect(result.current.error).toBe(true)
    expect(result.current.data.candidates.reviews.map(r => r.id)).toEqual(['first'])
    await act(() => result.current.loadMore())
    expect(request).toHaveBeenLastCalledWith('next')
    expect(result.current.error).toBe(false)
    expect(result.current.data.candidates.reviews.map(r => r.id)).toEqual(['first', 'next'])
    expect(result.current.data.page_info.has_next_page).toBe(false)
  })
})
