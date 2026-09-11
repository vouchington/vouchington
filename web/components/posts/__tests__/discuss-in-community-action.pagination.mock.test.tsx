import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscussInCommunityAction } from '../discuss-in-community-action'
import { loadMyCommunities, searchMyCommunities } from '@/lib/api/client/communities'
import { toast } from 'sonner'
import type { Community, CommunitiesSearchResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

const { mockLoadMyCommunitiesFn, mockSearchMyCommunitiesFn } = vi.hoisted(() => ({
  mockLoadMyCommunitiesFn: vi.fn<VitestLooseMock>(),
  mockSearchMyCommunitiesFn: vi.fn<VitestLooseMock>(),
}))

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

import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'
const mockSearchMyCommunities = vi.mocked(searchMyCommunities)
const mockLoadMyCommunities = vi.mocked(loadMyCommunities)
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

describe('DiscussInCommunityAction pagination loading', () => {
  beforeEach(() => {
    mockSearchMyCommunities.mockReset()
    mockLoadMyCommunities.mockReset()
    mockLoadMyCommunities.mockImplementation(loadFromSearchMyCommunities)
    mockToastError.mockReset()
    window.history.replaceState({}, '', '/discussion/source-1')
  })

  it('renders first-page options while later community pages are still loading', async () => {
    let resolveSecondPage!: (response: CommunitiesSearchResponseBody) => void
    mockSearchMyCommunities
      .mockResolvedValueOnce(
        makeCommunitiesSearchResponse({
          communities: [
            makeCommunity({ id: 'first-page', name: 'First Page', slug: 'first-page' }),
          ],
          pageInfo: {
            has_next_page: true,
            start_cursor: null,
            end_cursor: 'page-2',
          },
        }),
      )
      .mockReturnValueOnce(
        new Promise<CommunitiesSearchResponseBody>(resolve => {
          resolveSecondPage = resolve
        }),
      )

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('First Page')
    expect(screen.getByLabelText('Community')).not.toBeDisabled()
    expect(mockSearchMyCommunities).toHaveBeenNthCalledWith(2, 100, 'page-2')

    await act(async () => {
      resolveSecondPage(
        makeCommunitiesSearchResponse({
          communities: [
            makeCommunity({ id: 'second-page', name: 'Second Page', slug: 'second-page' }),
          ],
          pageInfo: {
            has_next_page: false,
            start_cursor: 'page-2',
            end_cursor: 'page-2-end',
          },
        }),
      )
    })

    fireEvent.click(screen.getByLabelText('Community'))
    expect(await screen.findByText('Second Page')).toBeInTheDocument()
  })

  it('keeps first-page options when a later community page fails and retries on reopen', async () => {
    mockSearchMyCommunities
      .mockResolvedValueOnce(
        makeCommunitiesSearchResponse({
          communities: [
            makeCommunity({ id: 'first-page', name: 'First Page', slug: 'first-page' }),
          ],
          pageInfo: {
            has_next_page: true,
            start_cursor: null,
            end_cursor: 'page-2',
          },
        }),
      )
      .mockRejectedValueOnce(new Error('page failed'))
      .mockResolvedValueOnce(
        makeCommunitiesSearchResponse({
          communities: [
            makeCommunity({ id: 'retry-page', name: 'Retry Page', slug: 'retry-page' }),
          ],
          pageInfo: {
            has_next_page: false,
            start_cursor: null,
            end_cursor: null,
          },
        }),
      )

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('First Page')
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Could not load every community.')
    })
    expect(screen.getByLabelText('Community')).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('Retry Page')
    expect(mockSearchMyCommunities).toHaveBeenCalledTimes(3)
  })

  it('caches a completed empty community load', async () => {
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [],
        pageInfo: {
          has_next_page: false,
          start_cursor: null,
          end_cursor: null,
        },
      }),
    )

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('No available communities found.')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('No available communities found.')
    expect(mockSearchMyCommunities).toHaveBeenCalledOnce()
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
