import {
  makeRecommendationPost,
  mockCreateTopicRecommendation,
  mockFetchTopicRecommendationDuplicates,
  mockRouterPush,
  mockUpdateTopicRecommendation,
} from '@/test-helpers/components/topic-recommendations/topic-recommendation-form.mock-support'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationForm } from '../topic-recommendation-form'

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

  it('submits a new recommendation payload', async () => {
    mockCreateTopicRecommendation.mockResolvedValue({
      post: mockRecommendationPost,
    })

    render(<TopicRecommendationForm />)

    fireEvent.change(screen.getByLabelText('Proposed Topic Title'), {
      target: { value: 'Test Topic' },
    })
    fireEvent.change(screen.getByLabelText('Proposed Topic Slug'), {
      target: { value: 'test-topic' },
    })
    fireEvent.change(screen.getByLabelText('Topic Description Markdown'), {
      target: { value: 'Suggested description' },
    })
    fireEvent.change(screen.getByLabelText('Primary Hostname'), {
      target: { value: 'example.com' },
    })
    fireEvent.change(screen.getByLabelText('Related Hostnames'), {
      target: { value: 'example.com\nexample.org' },
    })
    fireEvent.change(screen.getByLabelText('Why should this topic exist?'), {
      target: { value: 'It fills a gap in the topic catalog.' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Recommendation' }))

    await waitFor(() => {
      expect(mockCreateTopicRecommendation).toHaveBeenCalledWith({
        title: undefined,
        markdown: 'It fills a gap in the topic catalog.',
        topic_title: 'Test Topic',
        topic_slug: 'test-topic',
        topic_markdown: 'Suggested description',
        topic_hostname: 'example.com',
        topic_hostnames: ['example.com', 'example.org'],
        topic_aliases: [],
        topic_type: 'topic',
        example_referral_link: undefined,
        landing_page_urls: [],
        cf_turnstile_response: 'test-turnstile-token',
      })
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/topic-recommendations')
  })

  it('updates an existing recommendation', async () => {
    mockUpdateTopicRecommendation.mockResolvedValue({
      post: mockRecommendationPost,
    })

    render(<TopicRecommendationForm recommendation={mockRecommendationPost} />)

    fireEvent.change(screen.getByLabelText('Proposed Topic Title'), {
      target: { value: 'Updated Topic' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Recommendation' }))

    await waitFor(() => {
      expect(mockUpdateTopicRecommendation).toHaveBeenCalledWith('topic-rec-1', {
        title: 'Original title',
        markdown: 'Original rationale',
        topic_title: 'Updated Topic',
        topic_slug: 'original-topic',
        topic_markdown: 'Original topic markdown',
        topic_hostname: 'example.com',
        topic_hostnames: ['example.com'],
        topic_aliases: ['alias-one'],
        topic_type: 'topic',
        example_referral_link: undefined,
        landing_page_urls: [],
      })
    })
  })
})
