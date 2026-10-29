import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewTopicsFieldset } from './post-form-sections'
import { useReviewTopicState } from './post-form/review-topic-state'
import type { Post } from '@/types/posts'
import { fetchTopics } from '@/lib/api/client/topics'
import { makeTopic, makeTopicsSearchResponse } from '@/test-helpers/api-responses/topics'

vi.mock(import('@/lib/api/client/topics'), () => ({ fetchTopics: vi.fn<typeof fetchTopics>() }))

function SavedReview() {
  const state = useReviewTopicState({
    post: {
      review_topic_ratings: [{ topic_id: 'saved-topic-id', rating: 4 }],
    } as Post,
    initialReviewTopic: { id: 'different-topic-id', name: 'Different topic' },
  })
  return (
    <>
      <ReviewTopicsFieldset
        {...state}
        onReviewTopicChange={state.handleReviewTopicChange}
        onReviewRatingChange={state.handleReviewRatingChange}
      />
      <output aria-label='Saved rating'>
        {JSON.stringify(state.reviewTopics.map(({ topicId, rating }) => ({ topicId, rating })))}
      </output>
    </>
  )
}

describe('ReviewTopicsFieldset', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows a replaceable unavailable topic while retaining its saved identity and rating', async () => {
    vi.useFakeTimers()
    vi.mocked(fetchTopics).mockResolvedValue(
      makeTopicsSearchResponse({
        topics: [makeTopic({ id: 'replacement-topic', name: 'Replacement topic' })],
      }),
    )
    render(<SavedReview />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('Topic unavailable')
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked()
    expect(screen.getByLabelText('Saved rating')).toHaveTextContent(
      '"topicId":"saved-topic-id","rating":4',
    )
    expect(screen.queryByText('saved-topic-id')).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Replacement' } })
    await act(() => vi.advanceTimersByTimeAsync(300))
    fireEvent.click(screen.getByRole('option', { name: 'Replacement topic' }))
    expect(input).toHaveValue('Replacement topic')
    expect(screen.getByLabelText('Saved rating')).toHaveTextContent(
      '"topicId":"replacement-topic","rating":4',
    )
  })
})
