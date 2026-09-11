import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { DiscussInCommunityAction } from '../discuss-in-community-action'

import { loadMyCommunities, searchMyCommunities } from '@/lib/api/client/communities'

import { createCommunityPost } from '@/lib/api/client/posts'

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
