import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedVideosPage from './page'
import { feedRouteConfigs } from '@/lib/feed-route-configs'

const { mockFeedNewsListPage } = vi.hoisted(() => ({
  mockFeedNewsListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/feed/feed-news-list-page'), () => ({
  FeedNewsListPage: mockFeedNewsListPage,
}))

describe('FeedVideosPage', () => {
  beforeEach(() => {
    mockFeedNewsListPage.mockReset()
    mockFeedNewsListPage.mockReturnValue(<div>feed videos page</div>)
  })

  it('renders FeedNewsListPage with videos config', async () => {
    const ui = await FeedVideosPage({ searchParams: Promise.resolve({}) })

    render(ui)

    expect(screen.getByText('feed videos page')).toBeDefined()
    expect(mockFeedNewsListPage.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        config: feedRouteConfigs['videos'],
        searchParams: {},
      }),
    )
  })
})
