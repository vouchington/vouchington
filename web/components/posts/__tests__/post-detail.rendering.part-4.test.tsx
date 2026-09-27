import {
  basePost,
  resetPostDetailRenderingMocks,
} from '@/test-helpers/components/posts/post-detail-rendering.mock-support'

import { beforeEach, describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'

import { PostDetailView as PostDetail } from '../post-detail-view'

import type { Post } from '@/types/posts'

describe('PostDetail rendering', () => {
  beforeEach(() => {
    resetPostDetailRenderingMocks()
  })

  it('review: renders stars only as badge pills, not as a separate icon list', () => {
    const reviewPost: Post = {
      ...basePost,
      post_type: 'review',
      title: 'Bank review',
      review_topic_ratings: [
        {
          topic_id: 'topic-chase',
          rating: 5,
          order_index: 0,
          updated_at: '2024-01-01T00:00:00Z',
          topic: {
            __entity_type: 'topic' as const,
            id: 'topic-chase',
            name: 'Chase',
            slug: 'chase',
            markdown: '',
            topic_type: 'card',
            created_at: '2024-01-01T00:00:00Z',
            referral_program_id: null,
          },
        },
        {
          topic_id: 'topic-citi',
          rating: 2,
          order_index: 1,
          updated_at: '2024-01-01T00:00:00Z',
          topic: {
            __entity_type: 'topic' as const,
            id: 'topic-citi',
            name: 'Citi',
            slug: 'citi',
            markdown: '',
            topic_type: 'card',
            created_at: '2024-01-01T00:00:00Z',
            referral_program_id: null,
          },
        },
      ],
    }

    render(
      <PostDetail
        post={reviewPost}
        html=''
      />,
    )

    expect(screen.getByRole('link', { name: 'Chase: 5 out of 5 stars' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Citi: 2 out of 5 stars' })).toBeDefined()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('shows rejected content to a route-authorized community moderator', () => {
    render(
      <PostDetail
        post={{ ...basePost, clearance_status: 'rejected' }}
        html='<p>Moderator-visible body</p>'
        isCommunityMod
      />,
    )

    expect(screen.getByText('Moderator-visible body')).toBeDefined()
  })

  it('renders trimmed authored titles while retaining their language metadata', () => {
    render(
      <PostDetail
        post={{
          ...basePost,
          title: '  مرحبا بالعالم  ',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
        html='<p>Body</p>'
      />,
    )
    const titleLink = screen.getByRole('link', { name: 'مرحبا بالعالم' })
    expect(titleLink).toHaveAttribute('lang', 'ar')
    expect(titleLink).toHaveAttribute('dir', 'rtl')
  })
})
