import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ListItemRow } from '../list-item-row'
import type { ListItem } from '@/types/api-responses'

function makeItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    __entity_type: 'list_item',
    id: 'item-1',
    list_id: 'list-1',
    item_type: 'rss_feed_item',
    entity_id: 'feed-item-1',
    order_index: 0,
    created_at: '2025-01-01T00:00:00Z',
    media_type: 'article',
    ...overrides,
  }
}

describe('ListItemRow', () => {
  it('renders article element with data-pw', () => {
    render(<ListItemRow item={makeItem()} />)
    expect(document.querySelector('[data-pw="list-item-row"]')).not.toBeNull()
  })

  it('shows Post badge for post items', () => {
    const { getByText } = render(
      <ListItemRow item={makeItem({ item_type: 'post', media_type: null })} />,
    )
    expect(getByText('Post')).not.toBeNull()
  })

  it('shows Article badge for rss_feed_item with article media_type', () => {
    const { getByText } = render(<ListItemRow item={makeItem({ media_type: 'article' })} />)
    expect(getByText('Article')).not.toBeNull()
  })

  it('shows Video badge for video media_type', () => {
    const { getByText } = render(<ListItemRow item={makeItem({ media_type: 'video' })} />)
    expect(getByText('Video')).not.toBeNull()
  })

  it('shows Podcast badge for audio media_type', () => {
    const { getByText } = render(<ListItemRow item={makeItem({ media_type: 'audio' })} />)
    expect(getByText('Podcast')).not.toBeNull()
  })

  it('falls back to Article for unknown media_type', () => {
    const { getByText } = render(<ListItemRow item={makeItem({ media_type: 'unknown' })} />)
    expect(getByText('Article')).not.toBeNull()
  })

  it('renders entity_id', () => {
    const { getByText } = render(<ListItemRow item={makeItem({ entity_id: 'abc-123' })} />)
    expect(getByText('abc-123')).not.toBeNull()
  })

  it('renders time element with dateTime attribute', () => {
    render(<ListItemRow item={makeItem({ created_at: '2025-03-15T00:00:00Z' })} />)
    const timeEl = document.querySelector('time')
    expect(timeEl?.getAttribute('dateTime')).toBe('2025-03-15T00:00:00Z')
  })
})
