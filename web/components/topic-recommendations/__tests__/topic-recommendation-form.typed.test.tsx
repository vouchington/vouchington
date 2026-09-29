import {
  makeRecommendationPost,
  mockCreateTopicRecommendation,
  mockFetchTopicRecommendationDuplicates,
  mockOnError,
} from '@/test-helpers/components/topic-recommendations/topic-recommendation-form.mock-support'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationForm } from '../topic-recommendation-form'

const mockRecommendationPost = makeRecommendationPost()

describe('TopicRecommendationForm – typed fields', () => {
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

  it('type selector defaults to "topic"', () => {
    render(<TopicRecommendationForm />)
    const select = screen.getByTestId('topic-type-select') as HTMLSelectElement
    expect(select.value).toBe('topic')
  })

  it('selecting "Referral Program" reveals the example referral link field', () => {
    render(<TopicRecommendationForm />)

    expect(screen.queryByLabelText('Example Referral Link')).toBeNull()

    fireEvent.change(screen.getByTestId('topic-type-select'), {
      target: { value: 'referral_program' },
    })

    expect(screen.getByLabelText('Example Referral Link')).toBeInTheDocument()
  })

  it('selecting "Card" reveals the landing page URLs field', () => {
    render(<TopicRecommendationForm />)

    expect(screen.queryByLabelText('Landing Page URLs')).toBeNull()

    fireEvent.change(screen.getByTestId('topic-type-select'), {
      target: { value: 'card' },
    })

    expect(screen.getByLabelText('Landing Page URLs')).toBeInTheDocument()
  })

  it('shows validation error when referral_program submitted without example referral link', async () => {
    render(<TopicRecommendationForm />)

    fillRequiredFields()
    fireEvent.change(screen.getByTestId('topic-type-select'), {
      target: { value: 'referral_program' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Recommendation' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          fallback: expect.stringContaining('example referral link'),
          skipSentry: true,
        }),
      )
    })
    expect(mockCreateTopicRecommendation).not.toHaveBeenCalled()
  })

  it('shows validation error when card submitted without landing page URLs', async () => {
    render(<TopicRecommendationForm />)

    fillRequiredFields()
    fireEvent.change(screen.getByTestId('topic-type-select'), {
      target: { value: 'card' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Recommendation' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          fallback: expect.stringContaining('landing page URL'),
          skipSentry: true,
        }),
      )
    })
    expect(mockCreateTopicRecommendation).not.toHaveBeenCalled()
  })

  it('submits referral_program recommendation with all required fields', async () => {
    mockCreateTopicRecommendation.mockResolvedValue({
      post: mockRecommendationPost,
    })

    render(<TopicRecommendationForm />)

    fillRequiredFields()
    fireEvent.change(screen.getByTestId('topic-type-select'), {
      target: { value: 'referral_program' },
    })
    fireEvent.change(screen.getByLabelText('Example Referral Link'), {
      target: { value: 'https://example.com/ref?code=abc' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Recommendation' }))

    await waitFor(() => {
      expect(mockCreateTopicRecommendation).toHaveBeenCalledWith(
        expect.objectContaining({
          topic_type: 'referral_program',
          example_referral_link: 'https://example.com/ref?code=abc',
        }),
      )
    })
  })

  it('submits card recommendation with landing page URLs', async () => {
    mockCreateTopicRecommendation.mockResolvedValue({
      post: mockRecommendationPost,
    })

    render(<TopicRecommendationForm />)

    fillRequiredFields()
    fireEvent.change(screen.getByTestId('topic-type-select'), {
      target: { value: 'card' },
    })
    fireEvent.change(screen.getByLabelText('Landing Page URLs'), {
      target: { value: 'https://bank.com/card-x\nhttps://partner.com/offer' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Recommendation' }))

    await waitFor(() => {
      expect(mockCreateTopicRecommendation).toHaveBeenCalledWith(
        expect.objectContaining({
          topic_type: 'card',
          landing_page_urls: ['https://bank.com/card-x', 'https://partner.com/offer'],
        }),
      )
    })
  })
})
