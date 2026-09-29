import '@/test-helpers/components/news/news-item-card.mock-support'

import { describe, expect, it } from 'vitest'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'
import { render, screen } from '@testing-library/react'
import { NewsItemCard } from '../news-item-card'
import type { RssFeedItem } from '@/types/rss-feed-items'

const mockItem: RssFeedItem = makeRssFeedItem({
  id: 'item-1',
  published_at: '2025-01-15T10:00:00Z',
  data: {
    link: 'https://example.com/article1',
    guid: 'test-guid-1',
    title: 'Test Article Title',
    contentSnippet: 'This is a test article excerpt.',
    media_type: undefined,
    video_platform: undefined,
    video_id: undefined,
    enclosure_url: undefined,
    enclosure_type: undefined,
    duration_seconds: undefined,
  },
  url: { id: 'url-1', url: 'https://example.com/article1' },
  rss_feed: {
    id: 'rss-feed-1',
    title: 'Tech Weekly',
    topic: makeRssFeedItemTopic({
      id: 'topic-1',
      name: 'Technology',
      slug: 'technology',
      topic_type: 'card',
    }),
  },
})

describe('NewsItemCard summary view (default)', () => {
  it('renders stripped contentSnippet as excerpt', () => {
    render(<NewsItemCard item={mockItem} />)
    expect(screen.getByText('This is a test article excerpt.')).toBeDefined()
  })

  it('falls back to description then summary for excerpt', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: { ...mockItem.data, contentSnippet: undefined, description: 'Description text' },
    }
    render(<NewsItemCard item={item} />)
    expect(screen.getByText('Description text')).toBeDefined()
  })

  it('falls back to media:description for YouTube excerpts', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        contentSnippet: '<p> </p>',
        description: ' ',
        'media:description': 'YouTube description text.',
        media_type: 'video',
        video_platform: 'youtube',
      },
    }
    render(<NewsItemCard item={item} />)
    expect(screen.getByText('YouTube description text.')).toBeDefined()
  })

  it('renders YouTube statistics as a dedicated metadata row', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        contentSnippet: undefined,
        description: undefined,
        summary: undefined,
        video_platform: 'youtube',
        'media:starRating': { average: 5, count: 659, min: 1, max: 5 },
        'media:statistics': { views: 11_740 },
      },
    }
    const { container } = render(<NewsItemCard item={item} />)
    expect(container.querySelector('[data-pw="youtube-rss-metadata-row"]')?.textContent).toBe(
      'YouTube \u00B7 11,740 views \u00B7 5 rating from 659 ratings',
    )
  })

  it('does not render YouTube metadata row for non-YouTube items', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        media_type: 'video',
        video_platform: 'vimeo',
        'media:statistics': { views: 11_740 },
      },
    }
    render(<NewsItemCard item={item} />)
    expect(screen.queryByText(/YouTube ·/)).toBeNull()
  })

  it('omits excerpt section when no excerpt fields are present', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        contentSnippet: undefined,
        description: undefined,
        summary: undefined,
      },
    }
    render(<NewsItemCard item={item} />)
    expect(screen.queryByText('Show more')).toBeNull()
  })

  it('wraps excerpt in a Link pointing to modal href', () => {
    render(<NewsItemCard item={mockItem} />)
    const excerpt = screen.getByText('This is a test article excerpt.')
    const link = excerpt.closest('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toContain('rss_item=item-1')
  })

  it('renders thumbnail image when both excerpt and thumbnailUrl are present', () => {
    const { container } = render(
      <NewsItemCard
        item={mockItem}
        thumbnailUrl='/sideload/abc123?w=400'
      />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('/sideload/abc123?w=400')
  })
  it('thumbnail image has width=128 and height=80 to prevent CLS', () => {
    const { container } = render(
      <NewsItemCard
        item={mockItem}
        thumbnailUrl='/sideload/abc123?w=400'
      />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('width')).toBe('128')
    expect(img?.getAttribute('height')).toBe('80')
  })
  it('does not render thumbnail when excerpt is absent even if thumbnailUrl is set', () => {
    const item: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        contentSnippet: undefined,
        description: undefined,
        summary: undefined,
      },
    }
    const { container } = render(
      <NewsItemCard
        item={item}
        thumbnailUrl='/sideload/abc123?w=400'
      />,
    )
    expect(container.querySelector('img[src^="/sideload/"]')).toBeNull()
  })
  it('does not render thumbnail when thumbnailUrl is absent', () => {
    const { container } = render(<NewsItemCard item={mockItem} />)
    expect(container.querySelector('img[src^="/sideload/"]')).toBeNull()
  })
  it('does not render summary thumbnail for video items even when thumbnailUrl is set', () => {
    const videoItem: RssFeedItem = {
      ...mockItem,
      data: {
        ...mockItem.data,
        media_type: 'video',
        video_platform: 'youtube',
        video_id: 'abc123',
      },
    }
    const { container } = render(
      <NewsItemCard
        item={videoItem}
        thumbnailUrl='/sideload/abc123?w=400'
      />,
    )
    // VideoEmbed renders its own poster <img>; scope check to the excerpt's <a>
    // to avoid false positives from the video embed thumbnail
    const excerpt = container.querySelector('[data-pw="news-item-excerpt"]')
    expect(excerpt?.closest('a')?.querySelector('img')).toBeNull()
  })
})
