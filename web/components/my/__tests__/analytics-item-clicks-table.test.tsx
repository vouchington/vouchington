import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnalyticsItemClicksTable } from '../analytics-item-clicks-table'
import type { LandingPageItem, LandingPageItemClickStats } from '@/types/landing-pages'

describe('AnalyticsItemClicksTable', () => {
  it('resolves the label for a free-form link item', () => {
    const items: LandingPageItem[] = [
      { id: 'item-1', type: 'link', label: 'My Portfolio', url: 'https://portfolio.example' },
    ]
    const itemClicks: LandingPageItemClickStats[] = [
      { item_id: 'item-1', item_type: 'link', click_count: 7 },
    ]

    render(
      <AnalyticsItemClicksTable
        items={items}
        itemClicks={itemClicks}
      />,
    )

    expect(screen.getByText('My Portfolio')).toBeDefined()
    expect(screen.getByText('7')).toBeDefined()
  })

  it('renders review labels as authored content with their language metadata', () => {
    const items: LandingPageItem[] = [
      {
        id: 'item-1',
        type: 'review',
        review: {
          id: 'review-1',
          title: '  مرحبا بالعالم  ',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
          slug: 'arabic-review',
          markdown: 'Review body',
          created_at: '2026-09-07T00:00:00.000Z',
          review_topic_ratings: [],
        },
      },
    ]
    const itemClicks: LandingPageItemClickStats[] = [
      { item_id: 'item-1', item_type: 'review', click_count: 7 },
    ]

    render(
      <AnalyticsItemClicksTable
        items={items}
        itemClicks={itemClicks}
      />,
    )

    const title = screen.getByText('مرحبا بالعالم')
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
  })

  it('falls back to the truncated id when no matching item exists', () => {
    const itemClicks: LandingPageItemClickStats[] = [
      { item_id: '0123456789abcdef', item_type: 'link', click_count: 1 },
    ]

    render(
      <AnalyticsItemClicksTable
        items={[]}
        itemClicks={itemClicks}
      />,
    )

    expect(screen.getByText('01234567…')).toBeDefined()
  })

  it('falls back to the truncated id for a whitespace-only review title', () => {
    const items: LandingPageItem[] = [
      {
        id: 'item-1',
        type: 'review',
        review: {
          id: 'review-1',
          title: '   ',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
          slug: 'empty-review',
          markdown: 'Review body',
          created_at: '2026-09-07T00:00:00.000Z',
          review_topic_ratings: [],
        },
      },
    ]
    const itemClicks: LandingPageItemClickStats[] = [
      { item_id: 'item-1', item_type: 'review', click_count: 7 },
    ]

    render(
      <AnalyticsItemClicksTable
        items={items}
        itemClicks={itemClicks}
      />,
    )

    expect(screen.getByText('item-1…')).toBeDefined()
  })
})
