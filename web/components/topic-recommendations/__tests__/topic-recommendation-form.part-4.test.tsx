import {
  makeRecommendationPost,
  mockCreateTopicRecommendation,
  mockFetchTopicRecommendationDuplicates,
  mockOnError,
  mockUpdateTopicRecommendation,
} from '@/test-helpers/components/topic-recommendations/topic-recommendation-form.mock-support'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationForm } from '../topic-recommendation-form'
import { ApiError } from '@/lib/api/error'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'

const mockRecommendationPost = makeRecommendationPost()

describe('TopicRecommendationForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockFetchTopicRecommendationDuplicates.mockResolvedValue({
      exact_topic: null,
      pending_recommendations: [],
      similar_topics: [],
    })
  })

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText('Proposed Topic Title'), {
      target: { value: 'Test Topic' },
    })
    fireEvent.change(screen.getByLabelText('Proposed Topic Slug'), {
      target: { value: 'test-topic' },
    })
    fireEvent.change(screen.getByLabelText('Why should this topic exist?'), {
      target: { value: 'It fills a gap in the topic catalog.' },
    })
  }

  it('Cmd+Enter and Ctrl+Enter on the rationale textarea submit the form; plain Enter does not', () => {
    mockCreateTopicRecommendation.mockResolvedValue({
      post: mockRecommendationPost,
    })

    render(<TopicRecommendationForm />)
    fillRequiredFields()

    const textarea = screen.getByLabelText('Why should this topic exist?') as HTMLTextAreaElement
    // Listen for the native submit event so each keypress is observed; the form's React
    // onSubmit guards re-entry via isSubmitting so it can't be reused as the spy.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })

  it('does not open the username dialog for IDENTITY_REQUIRED when editing', async () => {
    mockUpdateTopicRecommendation.mockRejectedValueOnce(
      new ApiError('An identity is required to create posts', 403, {
        code: 'IDENTITY_REQUIRED',
        message: 'An identity is required to create posts',
      }),
    )

    render(<TopicRecommendationForm recommendation={mockRecommendationPost} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save Recommendation' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
    expect(screen.queryByRole('dialog', { name: /create a username/i })).toBeNull()
  })
})
