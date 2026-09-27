import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  basePost,
  postDetailMockState,
  resetPostDetailRenderingMocks,
} from '@/test-helpers/components/posts/post-detail-rendering.mock-support'

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
  it('renders a fallback h1 for untitled posts', () => {
    const { rerender } = render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Untitled Discussion' })).toBeDefined()
    rerender(
      <PostDetail
        post={{
          ...basePost,
          title: '   ',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
        html=''
      />,
    )
    const heading = screen.getByRole('heading', { level: 1, name: 'Untitled Discussion' })
    expect(heading).not.toHaveAttribute('lang')
  })
  it('renders anonymous author labels for masked anonymous posts', () => {
    const post: Post = {
      ...basePost,
      title: 'Anonymous post',
      markdown: 'Body',
      broadcast: 'users',
      is_anonymous: true,
    }
    render(
      <PostDetail
        post={post}
        html='<p>Body</p>'
      />,
    )
    expect(screen.getByText('Posted by Anonymous')).toBeDefined()
    expect(screen.getByText('Signed In')).toBeDefined()
  })
  it('renders post type badge in badge strip below title', () => {
    render(
      <PostDetail
        post={{ ...basePost, title: 'Test Post' }}
        html=''
      />,
    )
    const heading = screen.getByRole('heading', { level: 1 })
    const badge = screen.getByText('Discussion', { exact: true })
    expect(badge).toBeDefined()
    expect(heading).toBeDefined()
  })
  it('sets content lang and direction on user-authored titles using declared language before detected language', () => {
    render(
      <PostDetail
        post={{
          ...basePost,
          title: 'مرحبا بالعالم',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
        html='<p>Body</p>'
      />,
    )
    const heading = screen.getByRole('heading', { level: 1, name: 'مرحبا بالعالم' })
    const titleLink = screen.getByRole('link', { name: 'مرحبا بالعالم' })
    expect(heading).toContainElement(titleLink)
    expect(titleLink).toHaveAttribute('lang', 'ar')
    expect(titleLink).toHaveAttribute('dir', 'rtl')
  })
  it('renders a linked community badge in the badge strip', () => {
    render(
      <PostDetail
        post={{ ...basePost, title: 'Community post', community_id: 'community-1' }}
        html=''
        community={{ id: 'community-1', name: 'Rewards Club', slug: 'rewards-club' }}
      />,
    )
    const link = screen.getByText('Rewards Club').closest('a')
    expect(link).toBeDefined()
    expect(link?.getAttribute('href')).toBe('/communities/rewards-club')
  })
  it('does not render Discuss for locked posts', () => {
    postDetailMockState.currentUser = { id: 'user-1' } as User
    render(
      <PostDetail
        post={{
          ...basePost,
          title: 'Locked discussion',
          locked_at: '2026-06-01T00:00:00Z',
        }}
        html=''
      />,
    )
    expect(screen.queryByRole('button', { name: 'Discuss in community' })).toBeNull()
  })
  it('does not fall back to embedded post community when community is null', () => {
    render(
      <PostDetail
        post={{
          ...basePost,
          title: 'Global post',
          community: { id: 'community-1', name: 'Rewards Club', slug: 'rewards-club' },
        }}
        html=''
        community={null}
      />,
    )
    expect(screen.queryByText('Rewards Club')).toBeNull()
  })
})
