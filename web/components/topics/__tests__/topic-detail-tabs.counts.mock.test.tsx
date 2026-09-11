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

describe('TopicDetailTabs counts and viewer_count display', () => {
  beforeEach(() => {
    mockPathname = '/card/topic-1/discussions'
  })

  it('renders public counts for available tabs', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: {
            discussions: 5,
            reviews: 3,
            'data-points': 2,
            news: 4,
            latest: 0,
          },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Posts (10)' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Reviews (3)' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Data Points (2)' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'News (4)' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: /Latest/ })).toBeNull()
  })

  it('renders + when viewer counts exceed public counts', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: {
            discussions: 5,
            reviews: 0,
            'data-points': 1,
            news: 2,
            latest: 0,
          },
          viewer_count: {
            discussions: 7,
            reviews: 2,
            'data-points': 1,
          },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Posts (6+)' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Reviews (0+)' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Data Points (1)' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'News (2)' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: 'News (2+)' })).toBeNull()
  })

  it('shows Latest tab when latest count > 0', () => {
    render(
      <TopicDetailTabs
        topicType='source'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 12 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Latest (12)' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: /News/ })).toBeNull()
  })

  it('hides Latest tab when latest count is 0', () => {
    render(
      <TopicDetailTabs
        topicType='source'
        topicId='topic-1'
        metrics={makeMetrics({
          count: { discussions: 0, reviews: 0, 'data-points': 0, news: 5, latest: 0 },
        })}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /Latest/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'News (5)' })).toBeDefined()
  })

  it('renders items in priority order: Posts, Reviews, Data Points, Referral Links, Latest, News', () => {
    render(
      <TopicDetailTabs
        topicType='referral-program'
        topicId='topic-1'
        topicTypeName='referral_program'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 2, 'data-points': 3, news: 4, latest: 5 },
        })}
      />,
    )

    const items = screen.getAllByRole('menuitem')
    const itemNames = items.map(t => t.textContent)
    expect(itemNames).toEqual([
      'Posts (6)',
      'Reviews (2)',
      'Data Points (3)',
      'Referral Links',
      'Latest (5)',
      'News (4)',
    ])
  })
})
