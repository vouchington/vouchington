import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedReferralLinksMutualPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedReferralLinksListPage } = vi.hoisted(() => ({
  mockFeedReferralLinksListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-referral-links-list-page'), () => ({
  FeedReferralLinksListPage: mockFeedReferralLinksListPage,
}))

describe('FeedReferralLinksMutualPage', () => {
  beforeEach(() => {
    mockFeedReferralLinksListPage.mockReset()
    mockFeedReferralLinksListPage.mockReturnValue(<div>mutual referral links page</div>)
  })

  it('renders FeedReferralLinksListPage with mutual config', async () => {
    const ui = await FeedReferralLinksMutualPage()

    render(ui)

    expect(screen.getByText('mutual referral links page')).toBeDefined()
    expect(mockFeedReferralLinksListPage.mock.calls[0]![0]).toEqual({
      config: feedRouteConfigs['referral-links/mutual'],
    })
  })
})
