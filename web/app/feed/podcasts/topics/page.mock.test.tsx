import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedPodcastsTopicsPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedNewsListPage } = vi.hoisted(() => ({
  mockFeedNewsListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-news-list-page'), () => ({
  FeedNewsListPage: mockFeedNewsListPage,
}))

describe('FeedPodcastsTopicsPage', () => {
  beforeEach(() => {
    mockFeedNewsListPage.mockReset()
    mockFeedNewsListPage.mockReturnValue(<div>feed podcasts topics page</div>)
  })

  it('renders FeedNewsListPage with podcasts/topics config', async () => {
    const ui = await FeedPodcastsTopicsPage({ searchParams: Promise.resolve({}) })

    render(ui)

    expect(screen.getByText('feed podcasts topics page')).toBeDefined()
    expect(mockFeedNewsListPage.mock.calls[0]![0]).toEqual({
      config: feedRouteConfigs['podcasts/topics'],
      searchParams: {},
    })
  })
})
