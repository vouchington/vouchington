import { describe, expect, it, vi, beforeEach } from 'vitest'

import { render, screen } from '@testing-library/react'

import { TopicDetailTabs } from '../topic-detail-tabs'

import type { TopicMetrics } from '@/types/topics'

let mockPathname = '/card/topic-1/discussions'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

function makeMetrics(overrides: Partial<TopicMetrics>): TopicMetrics {
  return {
    __entity_type: 'topic_metrics',
    id: 'topic-1',
    count: {
      discussions: 0,
      reviews: 0,
      'data-points': 0,
      news: 0,
      latest: 0,
    },
    ratings: {
      count: {
        '1': 0,
        '2': 0,
        '3': 0,
        '4': 0,
        '5': 0,
      },
    },
    ratings__updated_at: '2024-01-15T10:00:00Z',
    bookmarks: {
      follow: 0,
    },
    bookmarks__updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

describe('TopicDetailTabs tab visibility by topic type and pathname', () => {
  beforeEach(() => {
    mockPathname = '/card/topic-1/discussions'
  })

  it('hides Reviews tab when count is 0 and not on /reviews', () => {
    mockPathname = '/card/topic-1/posts'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 2, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /Reviews/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Posts (2)' })).toBeDefined()
  })

  it('shows Reviews tab without count when on /reviews and count is 0', () => {
    mockPathname = '/card/topic-1/reviews'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 2, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Reviews' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: 'Reviews (0)' })).toBeNull()
  })

  it('hides Data Points tab when count is 0 and not on /data-points', () => {
    mockPathname = '/card/topic-1/posts'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 2, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /Data Points/ })).toBeNull()
  })

  it('shows Data Points tab without count when on /data-points and count is 0', () => {
    mockPathname = '/card/topic-1/data-points'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 2, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Data Points' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: 'Data Points (0)' })).toBeNull()
  })

  it('hides Latest tab when count is 0 and not on /latest', () => {
    mockPathname = '/card/topic-1/posts'
    render(
      <TopicDetailTabs
        topicType='source'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 3, latest: 0 },
        })}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /Latest/ })).toBeNull()
  })

  it('shows Latest tab without count when on /latest and count is 0', () => {
    mockPathname = '/source/topic-1/latest'
    render(
      <TopicDetailTabs
        topicType='source'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 3, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Latest' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: 'Latest (0)' })).toBeNull()
  })

  it('shows crawl history only for paid RSS source viewers', () => {
    mockPathname = '/source/source-slug/latest'
    const { rerender } = render(
      <TopicDetailTabs
        topicType='source'
        topicTypeName='rss_feed'
        topicId='topic-1'
        topicSlug='source-slug'
        canViewCrawlHistory
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Crawl History' })).toHaveAttribute(
      'href',
      '/source/source-slug/crawls',
    )

    rerender(
      <TopicDetailTabs
        topicType='source'
        topicTypeName='rss_feed'
        topicId='topic-1'
        topicSlug='source-slug'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )
    expect(screen.queryByRole('menuitem', { name: 'Crawl History' })).toBeNull()
  })

  it('keeps Crawl History active on its list and detail routes', () => {
    mockPathname = '/source/source-slug/crawls'
    const { rerender } = render(
      <TopicDetailTabs
        topicType='source'
        topicTypeName='rss_feed'
        topicId='topic-1'
        topicSlug='source-slug'
        canViewCrawlHistory
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Crawl History' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    mockPathname = '/source/source-slug/crawls/crawl-1'
    rerender(
      <TopicDetailTabs
        topicType='source'
        topicTypeName='rss_feed'
        topicId='topic-1'
        topicSlug='source-slug'
        canViewCrawlHistory
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Crawl History' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('hides News tab when count is 0 and not on /news', () => {
    mockPathname = '/card/topic-1/posts'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /News/ })).toBeNull()
  })

  it('shows News tab without count when on /news and count is 0', () => {
    mockPathname = '/card/topic-1/news'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'News' })).toBeDefined()
  })

  it('returns null when all counts are 0 and user is not on any tab route', () => {
    mockPathname = '/card/topic-1/referral-links'
    const { container } = render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
