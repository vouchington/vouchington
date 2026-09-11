import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockGetUserRssFeedsCollection, mockNotFound } = vi.hoisted(() => ({
  mockGetUserRssFeedsCollection: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  getUserRssFeedsCollection: mockGetUserRssFeedsCollection,
}))
vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)
vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: { id: string } }) => (
    <div data-testid='rss-feed-list-item'>{feed.id}</div>
  ),
}))

import { UserViewedRssFeedRoute } from '../user-rss-feed-route'

const emptyFeedsData = {
  results: [],
  bookmarks: {},
  topic_elections: {},
  hostname_elections: {},
  election_votes: {},
}

describe('UserViewedRssFeedRoute', () => {
  beforeEach(() => {
    mockGetUserRssFeedsCollection.mockReset()
    mockNotFound.mockReset()
    mockNotFound.mockImplementation(() => {
      throw new Error('notFound')
    })
  })

  it('calls notFound when feedsData is null', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue(null)
    await expect(UserViewedRssFeedRoute({ idOrUsername: 'alice' })).rejects.toThrow('notFound')
  })

  it('renders empty state when feedsData has no results', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue(emptyFeedsData)
    const result = await UserViewedRssFeedRoute({ idOrUsername: 'alice' })
    render(result as React.ReactElement)
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.queryByTestId('rss-feed-list-item')).toBeNull()
  })

  it('renders rss feed list items when feedsData has results', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue({
      results: [{ id: 'feed-1', topic: { id: 'topic-1' }, hostname: { id: 'host-1' } }],
      bookmarks: {},
      topic_elections: {},
      hostname_elections: {},
      election_votes: {},
    })
    const result = await UserViewedRssFeedRoute({ idOrUsername: 'alice' })
    render(result as React.ReactElement)
    expect(screen.getByTestId('rss-feed-list-item')).toHaveTextContent('feed-1')
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  it('passes feedType to getUserRssFeedsCollection with viewed listType', async () => {
    mockGetUserRssFeedsCollection.mockResolvedValue(emptyFeedsData)
    await UserViewedRssFeedRoute({ idOrUsername: 'alice', feedType: 'podcast' })
    expect(mockGetUserRssFeedsCollection).toHaveBeenCalledWith('alice', 'viewed', {
      feedType: 'podcast',
    })
  })
})
