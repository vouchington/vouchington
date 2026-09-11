import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedVideosTopicsPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedNewsListPage } = vi.hoisted(() => ({
  mockFeedNewsListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-news-list-page'), () => ({
  FeedNewsListPage: mockFeedNewsListPage,
}))

describe('FeedVideosTopicsPage', () => {
  beforeEach(() => {
    mockFeedNewsListPage.mockReset()
    mockFeedNewsListPage.mockReturnValue(<div>feed videos topics page</div>)
  })

  it('renders FeedNewsListPage with videos/topics config', async () => {
    const ui = await FeedVideosTopicsPage({ searchParams: Promise.resolve({}) })

    render(ui)

    expect(screen.getByText('feed videos topics page')).toBeDefined()
    expect(mockFeedNewsListPage.mock.calls[0]![0]).toEqual({
      config: feedRouteConfigs['videos/topics'],
      searchParams: {},
    })
  })
})
