import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedReferralLinksPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedReferralLinksListPage } = vi.hoisted(() => ({
  mockFeedReferralLinksListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-referral-links-list-page'), () => ({
  FeedReferralLinksListPage: mockFeedReferralLinksListPage,
}))

describe('FeedReferralLinksPage', () => {
  beforeEach(() => {
    mockFeedReferralLinksListPage.mockReset()
    mockFeedReferralLinksListPage.mockReturnValue(<div>referral links page</div>)
  })

  it('renders FeedReferralLinksListPage with following config', async () => {
    const ui = await FeedReferralLinksPage()

    render(ui)

    expect(screen.getByText('referral links page')).toBeDefined()
    expect(mockFeedReferralLinksListPage.mock.calls[0]![0]).toEqual({
      config: feedRouteConfigs['referral-links'],
    })
  })
})
