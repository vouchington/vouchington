import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedReferralLinksListPage } from '../feed-referral-links-list-page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'
import { ApiError } from '@/lib/api/error'
import type { ReferralLinkFeedResponse } from '@/types/api-responses'

const { mockGetReferralLinksFeed } = vi.hoisted(() => ({
  mockGetReferralLinksFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/feeds'), () => ({
  getReferralLinksFeed: mockGetReferralLinksFeed,
}))

vi.mock(import('../feed-top-section'), () => ({
  FeedTopSection: () => <div>feed top section</div>,
}))

vi.mock(import('../referral-link-feed-list'), () => ({
  ReferralLinkFeedList: ({
    data,
    emptyState,
  }: {
    data: ReferralLinkFeedResponse
    emptyState?: ReactNode
  }) => (data.results.length > 0 ? <div>feed list</div> : <div>{emptyState}</div>),
}))

vi.mock(import('@/components/shared/empty-state'), () => ({
  EmptyState: () => <div>empty state</div>,
}))

vi.mock(import('@/components/shared/list-search-error'), () => ({
  ListSearchError: ({ message }: { message: string }) => <div>{message}</div>,
}))

const feedResponse: ReferralLinkFeedResponse = {
  results: [],
  users: {},
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

describe('FeedReferralLinksListPage', () => {
  beforeEach(() => {
    mockGetReferralLinksFeed.mockReset()
    mockGetReferralLinksFeed.mockResolvedValue(feedResponse)
  })

  it('renders feed top section and empty state when there are no results', async () => {
    const ui = await FeedReferralLinksListPage({
      config: feedRouteConfigs['referral-links'],
    })

    render(ui)

    expect(screen.getByText('feed top section')).toBeDefined()
    expect(screen.getByText('empty state')).toBeDefined()
  })

  it('renders feed list when results are present', async () => {
    const responseWithResults: ReferralLinkFeedResponse = {
      results: [
        {
          id: 'item-1',
          user_id: 'user-1',
          referral_program_id: 'prog-1',
          referral_program_name: 'Chase',
          referral_program_slug: 'chase',
          url: 'https://example.com/ref',
          label: null,
        },
      ],
      users: {
        'user-1': {
          id: 'user-1',
          username: 'alice',
          display_name: 'Alice',
          profile_image_id: null,
        },
      },
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    mockGetReferralLinksFeed.mockResolvedValue(responseWithResults)

    const ui = await FeedReferralLinksListPage({
      config: feedRouteConfigs['referral-links'],
    })

    render(ui)

    expect(screen.getByText('feed list')).toBeDefined()
  })

  it('shows list search error when API returns an error', async () => {
    mockGetReferralLinksFeed.mockRejectedValue(new ApiError('bad request', 400))

    const ui = await FeedReferralLinksListPage({
      config: feedRouteConfigs['referral-links'],
    })

    render(ui)

    expect(screen.getByText('bad request')).toBeDefined()
  })

  it('passes correct feedType from mutual config', async () => {
    await FeedReferralLinksListPage({
      config: feedRouteConfigs['referral-links/mutual'],
    })

    expect(mockGetReferralLinksFeed).toHaveBeenCalledWith('mutual_follows', {
      searchParams: { limit: 25 },
    })
  })
})
