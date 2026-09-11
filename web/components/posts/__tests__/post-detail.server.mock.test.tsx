import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Post } from '@/types/posts'
import type { PostDetailViewProps } from '../post-detail-view'
import { PostDetail } from '../post-detail'

const mockGetCurrentUser = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))

vi.mock(import('../post-detail-view'), () => ({
  PostDetailView: (props: PostDetailViewProps) => (
    <div
      data-testid='post-detail-view'
      data-owner={String(props.isOwner)}
      data-admin={String(props.isAdmin)}
      data-moderator={String(props.isModerator)}
      data-private-label={String(props.labels?.badges.private)}
      data-rating-label={props.labels?.ratingAriaLabel('Sample topic', 4)}
      data-byline-label={props.labels?.postedBy('Sample author')}
    />
  ),
}))

const post = {
  id: 'post-1',
  post_type: 'discussion',
  created_by_id: 'user-1',
} as Post

describe('PostDetail server shell', () => {
  it('projects viewer permissions without passing the user to the view', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      roles: ['administrator'],
    })

    render(await PostDetail({ post, html: '<p>Body</p>' }))

    expect(screen.getByTestId('post-detail-view')).toHaveAttribute('data-owner', 'true')
    expect(screen.getByTestId('post-detail-view')).toHaveAttribute('data-admin', 'true')
    expect(screen.getByTestId('post-detail-view')).toHaveAttribute('data-moderator', 'true')
    expect(screen.getByTestId('post-detail-view')).toHaveAttribute('data-private-label', 'Private')
    expect(screen.getByTestId('post-detail-view')).toHaveAttribute(
      'data-rating-label',
      'Sample topic: 4 out of 5 stars',
    )
    expect(screen.getByTestId('post-detail-view')).toHaveAttribute(
      'data-byline-label',
      'Posted by Sample author',
    )
  })

  it('projects route-authorized community moderators as moderation viewers', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'community-mod', roles: [] })

    render(await PostDetail({ post, html: '<p>Body</p>', isCommunityMod: true }))

    expect(screen.getByTestId('post-detail-view')).toHaveAttribute('data-moderator', 'true')
  })
})
