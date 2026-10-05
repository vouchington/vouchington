import {
  mockCreateCommunityPost,
  mockRouterPush,
  mockSearchMyCommunities,
  resetDiscussInCommunityMocks,
  sourcePost,
} from '@/test-helpers/components/posts/discuss-in-community-action.mock-support'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it } from 'vitest'

import { DiscussInCommunityAction } from '../discuss-in-community-action'

import { communityPendingPostsHref } from '@/lib/links/entity-href'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'

describe('DiscussInCommunityAction', () => {
  beforeEach(() => {
    resetDiscussInCommunityMocks()
  })

  it('creates a community discussion linked to the source post', async () => {
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [
          makeCommunity({ id: 'community-1', name: 'Test Community', slug: 'test-community' }),
        ],
      }),
    )
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...sourcePost, id: 'discussion-1', community_id: 'community-1' },
    })

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    const discussButton = screen.getByRole('button', { name: /discuss/i })
    expect(discussButton.className).toContain('h-11')
    expect(discussButton.querySelector('svg')).not.toBeNull()
    fireEvent.click(discussButton)

    await screen.findByText('Test Community')
    fireEvent.click(screen.getByRole('button', { name: 'Start discussion' }))

    await waitFor(() => {
      expect(mockCreateCommunityPost).toHaveBeenCalledWith('test-community', {
        community_id: 'community-1',
        post_type: 'discussion',
        parent_post_id: 'source-1',
        title: 'Discuss: Global source',
        markdown: '[Source post](/discussion/source-1)',
        broadcast: 'everyone',
        privacy: 'public',
        cf_turnstile_response: 'test-turnstile-token',
        recaptcha_token: 'test-recaptcha-token',
      })
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/discussion/discussion-1')
  })

  it('uses private visibility when discussing to a private community', async () => {
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [
          makeCommunity({
            id: 'community-1',
            name: 'Private Community',
            slug: 'private-community',
            visibility: 'private',
          }),
        ],
      }),
    )
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...sourcePost, id: 'discussion-1', community_id: 'community-1' },
    })

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('Private Community')
    fireEvent.click(screen.getByRole('button', { name: 'Start discussion' }))

    await waitFor(() => {
      expect(mockCreateCommunityPost).toHaveBeenCalledWith(
        'private-community',
        expect.objectContaining({ broadcast: 'users', privacy: 'private' }),
      )
    })
  })

  it('redirects approval-required discussions to the community pending destination', async () => {
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [
          makeCommunity({
            id: 'community-1',
            name: 'Approval Community',
            slug: 'approval-community',
            post_approval_required_at: '2026-01-01T00:00:00Z',
          }),
        ],
      }),
    )
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...sourcePost, id: 'discussion-1', community_id: 'community-1' },
    })

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('Approval Community')
    fireEvent.click(screen.getByRole('button', { name: 'Start discussion' }))

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        communityPendingPostsHref({ slug: 'approval-community' }),
      )
    })
  })

  it('redirects raid-mode pending discussions from response metadata', async () => {
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [
          makeCommunity({
            id: 'community-1',
            name: 'Raid Community',
            slug: 'raid-community',
          }),
        ],
      }),
    )
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...sourcePost, id: 'discussion-1', community_id: 'community-1' },
      community_post_review: {
        community_id: 'community-1',
        post_id: 'discussion-1',
        approved_at: null,
        rejected_at: null,
        unpublished_at: null,
      },
    })

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('Raid Community')
    fireEvent.click(screen.getByRole('button', { name: 'Start discussion' }))

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        communityPendingPostsHref({ slug: 'raid-community' }),
      )
    })
  })
})
