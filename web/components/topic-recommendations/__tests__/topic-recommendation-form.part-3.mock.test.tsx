import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TopicRecommendationForm } from '../topic-recommendation-form'

import { ApiError } from '@/lib/api/error'

import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'

import type { Post } from '@/types/posts'

const mockRouterPush = vi.fn<VitestLooseMock>()

const mockRouterRefresh = vi.fn<VitestLooseMock>()

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>().mockReturnValue('error message'),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
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
  onSuccess: mockOnSuccess,
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
  updateTopicRecommendation,
} from '@/lib/api/client/topic-recommendations'

import { updateMyIdentity } from '@/lib/api/client/my'

const mockCreateTopicRecommendation = vi.mocked(createTopicRecommendation)

const mockFetchTopicRecommendationDuplicates = vi.mocked(fetchTopicRecommendationDuplicates)

const mockUpdateTopicRecommendation = vi.mocked(updateTopicRecommendation)

const mockUpdateMyIdentity = vi.mocked(updateMyIdentity)

function makeRecommendationPost(overrides?: Partial<Post>): Post {
  return {
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
    ...overrides,
  }
}

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
