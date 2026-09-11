import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationForm } from '../topic-recommendation-form'
import type { Post } from '@/types/posts'

const mockRouterPush = vi.fn<VitestLooseMock>()
const mockRouterRefresh = vi.fn<VitestLooseMock>()
const { mockOnError } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>().mockReturnValue('error message'),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
        refresh: mockRouterRefresh,
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/topic-recommendations'), () => ({
  createTopicRecommendation: vi.fn<VitestLooseMock>(),
  fetchTopicRecommendationDuplicates: vi.fn<VitestLooseMock>().mockResolvedValue({
    exact_topic: null,
    pending_recommendations: [],
    similar_topics: [],
  }),
  updateTopicRecommendation: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: React.ReactNode
        onValueChange?: (v: string) => void
        value?: string
      }) => (
        <select
          data-testid='topic-type-select'
          value={value}
          onChange={e => onValueChange?.(e.target.value)}
        >
          {children}
        </select>
      ),
      SelectTrigger: () => null,
      SelectContent: ({ children }: { children: React.ReactNode }) => children,
      SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
        <option value={value}>{children}</option>
      ),
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

import {
  createTopicRecommendation,
  fetchTopicRecommendationDuplicates,
} from '@/lib/api/client/topic-recommendations'

const mockCreateTopicRecommendation = vi.mocked(createTopicRecommendation)

const mockFetchTopicRecommendationDuplicates = vi.mocked(fetchTopicRecommendationDuplicates)

const mockRecommendationPost: Post = {
  id: 'topic-rec-1',
  post_type: 'topic_recommendation',
  title: 'Original title',
  markdown: 'Original rationale',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'users',
  privacy: 'private',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
  topic_recommendation: {
    post_id: 'topic-rec-1',
    topic_title: 'Original Topic',
    topic_slug: 'original-topic',
    topic_markdown: 'Original topic markdown',
    aliases: ['alias-one'],
    hostname_id: 'hostname-1',
    hostname: { __entity_type: 'hostname', id: 'hostname-1', hostname: 'example.com' },
    hostnames: [{ __entity_type: 'hostname', id: 'hostname-1', hostname: 'example.com' }],
    topic_wikipedia_pageid: null,
    approval_error_message: null,
    status: 'pending',
    reviewed_at: null,
    reviewed_by_id: null,
    rejection_reason: null,
    created_topic_id: null,
    topic_type: 'topic',
    example_referral_link: null,
    landing_page_urls: [],
  },
}

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
