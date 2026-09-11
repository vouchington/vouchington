import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  makeRssFeedItem,
  makeRssFeedItemCategory,
  makeRssFeedItemTopic,
} from '@/test-helpers/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@ts-shared/utils/format'), () => ({
  formatUtcDate: (date: string) => `formatted:${date}`,
}))

vi.mock(import('@/components/feed/category-chips'), () => ({
  CategoryChips: ({
    categories,
    inline,
    tab,
  }: {
    categories: { category_text: string }[]
    inline?: boolean
    tab?: string
  }) => (
    <div
      data-testid='category-chips'
      data-inline={inline}
      data-tab={tab}
    >
      {categories.map(c => c.category_text).join(',')}
    </div>
  ),
}))

import { NewsItemHeader } from '../news-item-header'
import type { RssFeedItem } from '@/types/rss-feed-items'

const MOCK_ITEM: RssFeedItem = makeRssFeedItem({
  id: 'item-1',
  data: { link: 'https://example.com', guid: 'g1', title: 'Article' },
  url: { id: 'url-1', url: 'https://example.com' },
  rss_feed: {
    id: 'feed-1',
    title: 'Tech Feed',
    topic: makeRssFeedItemTopic({ id: 'topic-1', name: 'Tech', slug: 'tech' }),
  },
})

describe('NewsItemHeader', () => {
  it('renders source badge as a link with source-badge-link testid', () => {
    const { container } = render(<NewsItemHeader item={MOCK_ITEM} />)
    const link = container.querySelector('[data-pw="source-badge-link"]')
    expect(link).not.toBeNull()
    expect(link!.textContent).toContain('Tech Feed')
  })

  it('links source badge to the topic latest tab', () => {
    const { container } = render(<NewsItemHeader item={MOCK_ITEM} />)
    const link = container.querySelector('[data-pw="source-badge-link"]')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/topic/tech/latest')
  })

  it('links a source-type topic badge to the source latest tab', () => {
    const itemWithSource: RssFeedItem = {
      ...MOCK_ITEM,
      rss_feed: {
        ...MOCK_ITEM.rss_feed,
        topic: makeRssFeedItemTopic({
          id: 'source-1',
          name: 'dev.to',
          slug: 'dev.to',
          topic_type: 'source',
        }),
      },
    }
    const { container } = render(<NewsItemHeader item={itemWithSource} />)
    const link = container.querySelector('[data-pw="source-badge-link"]')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/source/dev.to/latest')
  })

  it('renders the published date', () => {
    render(<NewsItemHeader item={MOCK_ITEM} />)
    const date = screen.getByText('formatted:2026-01-01T00:00:00Z')
    expect(date).toBeDefined()
  })

  it('renders all elements inside the news-item-header wrapper', () => {
    const { container } = render(<NewsItemHeader item={MOCK_ITEM} />)
    const sourceLink = container.querySelector('[data-pw="source-badge-link"]')
    const publishedDate = screen.getByText('formatted:2026-01-01T00:00:00Z')
    expect(sourceLink).not.toBeNull()
    const header = sourceLink!.parentElement
    expect(header).not.toBeNull()
    expect(header!.contains(sourceLink)).toBe(true)
    expect(header!.contains(publishedDate)).toBe(true)
    expect(header!.contains(screen.getByTestId('category-chips'))).toBe(true)
  })

  it('passes inline=true to CategoryChips', () => {
    render(<NewsItemHeader item={MOCK_ITEM} />)
    const chips = screen.getByTestId('category-chips')
    expect(chips.getAttribute('data-inline')).toBe('true')
  })

  it('passes tab=news to CategoryChips', () => {
    render(<NewsItemHeader item={MOCK_ITEM} />)
    const chips = screen.getByTestId('category-chips')
    expect(chips.getAttribute('data-tab')).toBe('news')
  })

  it('renders in a scrollable row without flex-wrap', () => {
    const { container } = render(<NewsItemHeader item={MOCK_ITEM} />)
    const header = container.querySelector('[data-pw="news-item-header"]')
    expect(header?.className).toContain('overflow-x-auto')
    expect(header?.className).toContain('scrollbar-hide')
    expect(header?.className).not.toContain('flex-wrap')
  })

  it('renders category chips within the same flex row', () => {
    const itemWithCategories: RssFeedItem = {
      ...MOCK_ITEM,
      categories: [makeRssFeedItemCategory({ category_text: 'ai' })],
    }
    const { container } = render(<NewsItemHeader item={itemWithCategories} />)
    const header = container.querySelector('[data-pw="source-badge-link"]')?.parentElement
    const chips = screen.getByTestId('category-chips')
    expect(header).not.toBeNull()
    expect(header!.contains(chips)).toBe(true)
    expect(chips.textContent).toContain('ai')
  })
})
