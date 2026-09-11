import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedPodcastsSourcesPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedNewsListPage } = vi.hoisted(() => ({
  mockFeedNewsListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-news-list-page'), () => ({
  FeedNewsListPage: mockFeedNewsListPage,
}))

describe('FeedPodcastsSourcesPage', () => {
  beforeEach(() => {
    mockFeedNewsListPage.mockReset()
    mockFeedNewsListPage.mockReturnValue(<div>feed podcasts sources page</div>)
  })

  it('renders FeedNewsListPage with podcasts/sources config', async () => {
    const ui = await FeedPodcastsSourcesPage({ searchParams: Promise.resolve({}) })

    render(ui)

    expect(screen.getByText('feed podcasts sources page')).toBeDefined()
    expect(mockFeedNewsListPage.mock.calls[0]![0]).toEqual({
      config: feedRouteConfigs['podcasts/sources'],
      searchParams: {},
    })
  })
})
