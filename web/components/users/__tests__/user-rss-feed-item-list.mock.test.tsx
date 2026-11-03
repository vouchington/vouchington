import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HackerNewsReferenceLabel } from '@/components/hacker-news/hacker-news-reference-label'
import type { RssFeedItem } from '@/types/rss-feed-items'

vi.mock(import('@/components/feed/news-item-card'), () => ({
  NewsItemCard: ({ item }: { item: { id: string } }) => (
    <HackerNewsReferenceLabel entityId={item.id} />
  ),
}))

import { UserRssFeedItemList } from '../user-rss-feed-item-list'

describe('UserRssFeedItemList', () => {
  it('provides Hacker News counts to saved, hidden, and viewed list cards', () => {
    render(
      <UserRssFeedItemList
        items={[{ id: 'seen' }, { id: 'plain' }] as RssFeedItem[]}
        emptyTitle='Empty'
        emptyDescription='Nothing'
        hackerNewsReferences={{ seen: { story_count: 1, comment_count: 0 } }}
      />,
    )
    expect(screen.getAllByText(/Hacker News/u)).toHaveLength(1)
  })
})
