import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  basePost,
  postDetailMockState,
  resetPostDetailRenderingMocks,
} from '@/test-helpers/components/posts/post-detail-rendering.mock-support'

// Stub the overflow menu to avoid loading its full async module tree (report-dialog, radix)
// which causes EnvironmentTeardownError when the dynamic() loader resolves after teardown.
vi.mock(import('../post-detail-overflow-menu'), () => ({
  PostDetailOverflowMenu: () => null,
}))

import { render, screen } from '@testing-library/react'

import { PostDetailView as PostDetail } from '../post-detail-view'

import type { Post } from '@/types/posts'

import type { User } from '@/types/user'

describe('PostDetail rendering', () => {
  beforeEach(() => {
    resetPostDetailRenderingMocks()
  })

  it('renders category topics as badges in badge strip', () => {
    const post: Post = {
      ...basePost,
      title: 'Topic test',
      post_related_topics: [
        {
          __entity_type: 'topic' as const,
          id: 'topic-1',
          name: 'Credit Cards',
          topic_type: 'category',
          slug: 'credit-cards',
          referral_program_id: null,
        },
      ],
    }

    render(
      <PostDetail
        post={post}
        html=''
      />,
    )

    expect(screen.getByText('Credit Cards')).toBeDefined()
  })

  it('does not show comment count in action bar', () => {
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(screen.queryByText(/comments/)).toBeNull()
  })

  it('sets automatic direction on authored titles without known content language', () => {
    render(
      <PostDetail
        post={{
          ...basePost,
          title: 'مرحبا بالعالم',
          declared_language: null,
          lingua_rs_detected_language: null,
        }}
        html=''
      />,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'مرحبا بالعالم' })
    expect(heading).not.toHaveAttribute('lang')
    expect(heading).toHaveAttribute('dir', 'auto')
  })

  it('renders Subscribe button in action bar when currentUserId provided', async () => {
    postDetailMockState.currentUser = { id: 'user-123' } as User
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(await screen.findByRole('button', { name: /subscribe/i })).toBeDefined()
  })

  it('renders comment details without constructing a rootless canonical discussion source', () => {
    expect(() =>
      render(
        <PostDetail
          post={{ ...basePost, post_type: 'comment' }}
          html='<p>Comment body</p>'
        />,
      ),
    ).not.toThrow()
    expect(screen.queryByText('Discuss in community')).toBeNull()
  })
})
