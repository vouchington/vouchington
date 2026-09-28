import {
  mockCreateCommunityPost,
  mockRouterPush,
  mockSearchMyCommunities,
  mockToastError,
  resetDiscussInCommunityMocks,
  sourcePost,
} from '@/test-helpers/components/posts/discuss-in-community-action.mock-support'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it } from 'vitest'

import { DiscussInCommunityAction } from '../discuss-in-community-action'

import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'

describe('DiscussInCommunityAction', () => {
  beforeEach(() => {
    resetDiscussInCommunityMocks()
  })

  it('excludes archived communities from the selector', async () => {
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [
          makeCommunity({
            id: 'archived-community',
            name: 'Archived Community',
            slug: 'archived-community',
            archived_at: '2026-01-01T00:00:00Z',
            archived_by_id: 'user-1',
          }),
          makeCommunity({
            id: 'active-community',
            name: 'Active Community',
            slug: 'active-community',
          }),
        ],
      }),
    )

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('Active Community')
    expect(screen.queryByText('Archived Community')).toBeNull()
  })

  it('shows toast.error when createCommunityPost throws', async () => {
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [
          makeCommunity({ id: 'community-1', name: 'Test Community', slug: 'test-community' }),
        ],
      }),
    )
    mockCreateCommunityPost.mockRejectedValue(new Error('Server error'))

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('Test Community')
    fireEvent.click(screen.getByRole('button', { name: 'Start discussion' }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Server error')
    })
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})
