import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedPodcastsPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedNewsListPage } = vi.hoisted(() => ({
  mockFeedNewsListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-news-list-page'), () => ({
  FeedNewsListPage: mockFeedNewsListPage,
}))

describe('FeedPodcastsPage', () => {
  beforeEach(() => {
    mockFeedNewsListPage.mockReset()
    mockFeedNewsListPage.mockReturnValue(<div>feed podcasts page</div>)
  })

  it('renders FeedNewsListPage with podcasts config', async () => {
    const ui = await FeedPodcastsPage({ searchParams: Promise.resolve({}) })

    render(ui)

    expect(screen.getByText('feed podcasts page')).toBeDefined()
    expect(mockFeedNewsListPage.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        config: feedRouteConfigs['podcasts'],
        searchParams: {},
      }),
    )
  })
})
