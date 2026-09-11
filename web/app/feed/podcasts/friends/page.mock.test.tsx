import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedPodcastsFriendsPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedNewsListPage } = vi.hoisted(() => ({
  mockFeedNewsListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-news-list-page'), () => ({
  FeedNewsListPage: mockFeedNewsListPage,
}))

describe('FeedPodcastsFriendsPage', () => {
  beforeEach(() => {
    mockFeedNewsListPage.mockReset()
    mockFeedNewsListPage.mockReturnValue(<div>feed podcasts friends page</div>)
  })

  it('renders FeedNewsListPage with podcasts/friends config', async () => {
    const ui = await FeedPodcastsFriendsPage({ searchParams: Promise.resolve({}) })

    render(ui)

    expect(screen.getByText('feed podcasts friends page')).toBeDefined()
    expect(mockFeedNewsListPage.mock.calls[0]![0]).toEqual({
      config: feedRouteConfigs['podcasts/friends'],
      searchParams: {},
    })
  })
})
