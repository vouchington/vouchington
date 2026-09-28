import {
  makeRecommendationPost,
  mockCreateTopicRecommendation,
  mockFetchTopicRecommendationDuplicates,
  mockRouterPush,
  mockUpdateMyIdentity,
} from '@/test-helpers/components/topic-recommendations/topic-recommendation-form.mock-support'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationForm } from '../topic-recommendation-form'
import { ApiError } from '@/lib/api/error'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'

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

  it('retries recommendation creation after username is set via the dialog', async () => {
    mockCreateTopicRecommendation
      .mockRejectedValueOnce(
        new ApiError('An identity is required to create posts', 403, {
          code: 'IDENTITY_REQUIRED',
          message: 'An identity is required to create posts',
        }),
      )
      .mockResolvedValueOnce({
        post: mockRecommendationPost,
      })

    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)

    render(<TopicRecommendationForm />)
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Submit Recommendation' }))

    await waitFor(() => {
      expect(mockFetchTopicRecommendationDuplicates).toHaveBeenCalledWith(
        expect.objectContaining({
          topic_slug: 'test-topic',
          topic_title: 'Test Topic',
        }),
      )
    })

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /create a username to continue posting/i }),
      ).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), {
      target: { value: 'newusername' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create username & post/i }))

    await waitFor(() => {
      expect(mockUpdateMyIdentity).toHaveBeenCalledWith({ username: 'newusername' })
      expect(mockCreateTopicRecommendation).toHaveBeenCalledTimes(2)
      expect(mockRouterPush).toHaveBeenCalledWith('/topic-recommendations')
    })
  })

  it('re-enables the submit button when the username dialog is dismissed', async () => {
    mockCreateTopicRecommendation.mockRejectedValueOnce(
      new ApiError('An identity is required to create posts', 403, {
        code: 'IDENTITY_REQUIRED',
        message: 'An identity is required to create posts',
      }),
    )

    render(<TopicRecommendationForm />)
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Submit Recommendation' }))

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /create a username to continue posting/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit Recommendation' })).not.toBeDisabled()
    })
  })

  it('Enter on the topic title input submits the recommendation through the API client', async () => {
    mockCreateTopicRecommendation.mockResolvedValue({
      post: mockRecommendationPost,
    })

    render(<TopicRecommendationForm />)
    fillRequiredFields()

    const titleInput = screen.getByLabelText('Proposed Topic Title') as HTMLInputElement
    void expectInputEnterSubmits({ input: titleInput, onSubmit: mockCreateTopicRecommendation })

    await waitFor(() => {
      expect(mockCreateTopicRecommendation).toHaveBeenCalled()
    })
  })
})
