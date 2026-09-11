import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { PostReviewReferralLinksAside } from '../post-review-referral-links-aside'
import type { Post } from '@/types/posts'

const { mockGetCurrentUser, mockGetPrioritizedReferralLinks } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetPrioritizedReferralLinks: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getPrioritizedReferralLinks: mockGetPrioritizedReferralLinks,
}))

vi.mock(
  import('@/components/referral-links/referral-links-aside-content'),
  () =>
    ({
      ReferralLinksAsideContent: ({
        topicId,
        topicSlug,
        topicType,
      }: {
        topicId: string
        topicSlug: string | null
        topicType: string
      }) => (
        <div
          data-testid='aside-content'
          data-topic-id={topicId}
          data-topic-slug={topicSlug ?? ''}
          data-topic-type={topicType}
        />
      ),
    }) as unknown as typeof import('@/components/referral-links/referral-links-aside-content'),
)

vi.mock(import('@/components/referral-links/referral-links-aside-streaming'), () => ({
  ReferralLinksAsideStreaming: () => <div data-testid='aside-streaming' />,
}))

function makeReviewPost(overrides?: Partial<Post>): Post {
  return {
    id: 'post-1',
    post_type: 'review',
    title: 'My Review',
    markdown: '',
    root_id: null,
    created_by_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    broadcast: 'everyone',
    privacy: 'public',
    is_anonymous: false,
    community_id: null,
    clearance_status: 'approved',
    ...overrides,
  }
}

const mockResponse = { results: [], referral_links: {}, topics: {} }

describe('PostReviewReferralLinksAside', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetPrioritizedReferralLinks.mockResolvedValue(mockResponse)
  })

  it('renders nothing for non-review posts', async () => {
    const result = await PostReviewReferralLinksAside({
      post: makeReviewPost({ post_type: 'discussion' }),
    })
    expect(result).toBeNull()
  })

  it('renders nothing when no review_topic_ratings', async () => {
    const result = await PostReviewReferralLinksAside({
      post: makeReviewPost({ review_topic_ratings: [] }),
    })
    expect(result).toBeNull()
  })

  it('uses topic.slug when topic_type is referral_program', async () => {
    const result = await PostReviewReferralLinksAside({
      post: makeReviewPost({
        review_topic_ratings: [
          {
            topic_id: 'rp-1',
            rating: 5,
            order_index: 0,
            updated_at: new Date().toISOString(),
            topic: {
              __entity_type: 'topic',
              id: 'rp-1',
              name: 'Chase Referral',
              slug: 'chase-referral',
              markdown: '',
              topic_type: 'referral_program',
              created_at: new Date().toISOString(),
              referral_program_id: null,
            },
          },
        ],
      }),
    })
    const { getByTestId } = render(result as React.ReactElement)
    expect(getByTestId('aside-content')).toHaveAttribute('data-topic-slug', 'chase-referral')
    expect(mockGetPrioritizedReferralLinks).toHaveBeenCalledWith('rp-1')
  })

  it('uses referral_program_slug when topic has referral_program_id', async () => {
    const result = await PostReviewReferralLinksAside({
      post: makeReviewPost({
        review_topic_ratings: [
          {
            topic_id: 'topic-1',
            rating: 4,
            order_index: 0,
            updated_at: new Date().toISOString(),
            topic: {
              __entity_type: 'topic',
              id: 'topic-1',
              name: 'Chase Sapphire',
              slug: 'chase-sapphire',
              markdown: '',
              topic_type: 'card',
              created_at: new Date().toISOString(),
              referral_program_id: 'rp-2',
              referral_program_slug: 'chase-referral-v2',
            },
          },
        ],
      }),
    })
    const { getByTestId } = render(result as React.ReactElement)
    expect(getByTestId('aside-content')).toHaveAttribute('data-topic-slug', 'chase-referral-v2')
    expect(mockGetPrioritizedReferralLinks).toHaveBeenCalledWith('rp-2')
  })

  it('falls back to null slug when referral_program_slug is absent', async () => {
    const result = await PostReviewReferralLinksAside({
      post: makeReviewPost({
        review_topic_ratings: [
          {
            topic_id: 'topic-1',
            rating: 4,
            order_index: 0,
            updated_at: new Date().toISOString(),
            topic: {
              __entity_type: 'topic',
              id: 'topic-1',
              name: 'Chase Sapphire',
              slug: 'chase-sapphire',
              markdown: '',
              topic_type: 'card',
              created_at: new Date().toISOString(),
              referral_program_id: 'rp-2',
            },
          },
        ],
      }),
    })
    const { getByTestId } = render(result as React.ReactElement)
    expect(getByTestId('aside-content')).toHaveAttribute('data-topic-slug', '')
  })
})
