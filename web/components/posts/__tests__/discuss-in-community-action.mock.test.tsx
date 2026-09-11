import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { DiscussInCommunityAction } from '../discuss-in-community-action'

import { loadMyCommunities, searchMyCommunities } from '@/lib/api/client/communities'

import { createCommunityPost } from '@/lib/api/client/posts'

import { communityPendingPostsHref } from '@/lib/links/entity-href'

import { toast } from 'sonner'

import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'
import type { Community } from '@/types/api-responses'
import type { Post } from '@/types/posts'

const mockRouterPush = vi.fn<VitestLooseMock>()
const { mockLoadMyCommunitiesFn, mockSearchMyCommunitiesFn } = vi.hoisted(() => ({
  mockLoadMyCommunitiesFn: vi.fn<VitestLooseMock>(),
  mockSearchMyCommunitiesFn: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockRouterPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/communities'), () => ({
  loadMyCommunities: mockLoadMyCommunitiesFn,
  searchMyCommunities: mockSearchMyCommunitiesFn,
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  createCommunityPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockSearchMyCommunities = vi.mocked(searchMyCommunities)
const mockLoadMyCommunities = vi.mocked(loadMyCommunities)

const mockCreateCommunityPost = vi.mocked(createCommunityPost)

const mockToastError = vi.mocked(toast.error)

const sourcePost: Post = {
  id: 'source-1',
  post_type: 'discussion',
  title: 'Global source',
  markdown: 'source',
  root_id: null,
  parent_id: null,
  created_by_id: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,

  community_id: null,

  clearance_status: 'approved',
}

describe('DiscussInCommunityAction', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockSearchMyCommunities.mockReset()
    mockLoadMyCommunities.mockReset()
    mockLoadMyCommunities.mockImplementation(loadFromSearchMyCommunities)
    mockCreateCommunityPost.mockReset()
    mockToastError.mockClear()
    window.history.replaceState({}, '', '/discussion/source-1')
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
        parent_id: 'source-1',
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

async function loadFromSearchMyCommunities(
  after?: string,
  available: Community[] = [],
  onAvailableCommunities?: (communities: Community[]) => void,
): Promise<Community[]> {
  const response = await mockSearchMyCommunities(100, after)
  const previousCount = available.length
  for (const result of response.results) {
    const community = response.communities[result.id]
    if (community && !community.archived_at) available.push(community)
  }
  if (available.length > previousCount) onAvailableCommunities?.([...available])
  const nextAfter = response.page_info.has_next_page
    ? (response.page_info.end_cursor ?? undefined)
    : undefined
  return nextAfter
    ? loadFromSearchMyCommunities(nextAfter, available, onAvailableCommunities)
    : available
}
