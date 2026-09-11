import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

vi.mock(import('@/components/podcasts/podcast-list-item'), () => ({
  PodcastListItem: () => <div data-testid='podcast-list-item' />,
}))

vi.mock(import('@/components/sources/video-list-item'), () => ({
  VideoListItem: () => <div data-testid='video-list-item' />,
}))

vi.mock(import('@/components/sources/article-list-item'), () => ({
  ArticleListItem: () => <div data-testid='article-list-item' />,
}))

import { type RssFeedListItemProps, RssFeedListItem } from '../rss-feed-list-item'

type FeedProp = RssFeedListItemProps['feed']

describe('RssFeedListItem routing', () => {
  it('renders PodcastListItem when feed_type is podcast', () => {
    const feed = { id: 'f1', feed_type: 'podcast' } as FeedProp

    render(<RssFeedListItem feed={feed} />)

    expect(screen.getByTestId('podcast-list-item')).toBeDefined()
    expect(screen.queryByTestId('video-list-item')).toBeNull()
    expect(screen.queryByTestId('article-list-item')).toBeNull()
  })

  it('renders VideoListItem when feed_type is video', () => {
    const feed = { id: 'f1', feed_type: 'video' } as FeedProp

    render(<RssFeedListItem feed={feed} />)

    expect(screen.getByTestId('video-list-item')).toBeDefined()
    expect(screen.queryByTestId('podcast-list-item')).toBeNull()
    expect(screen.queryByTestId('article-list-item')).toBeNull()
  })

  it('renders ArticleListItem when feed_type is article', () => {
    const feed = { id: 'f1', feed_type: 'article' } as FeedProp

    render(<RssFeedListItem feed={feed} />)

    expect(screen.getByTestId('article-list-item')).toBeDefined()
    expect(screen.queryByTestId('podcast-list-item')).toBeNull()
    expect(screen.queryByTestId('video-list-item')).toBeNull()
  })

  it('renders ArticleListItem when feed_type is not podcast or video (default branch)', () => {
    const feed = { id: 'f1', feed_type: 'rss' } as unknown as FeedProp

    render(<RssFeedListItem feed={feed} />)

    expect(screen.getByTestId('article-list-item')).toBeDefined()
    expect(screen.queryByTestId('podcast-list-item')).toBeNull()
    expect(screen.queryByTestId('video-list-item')).toBeNull()
  })
})
