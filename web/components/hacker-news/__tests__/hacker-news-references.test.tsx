import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HackerNewsReferenceLabel } from '../hacker-news-reference-label'
import { HackerNewsReferencesAside } from '../hacker-news-references-aside'
import { HackerNewsReferencesProvider } from '../hacker-news-references-context'

describe('HackerNewsReferenceLabel', () => {
  it('shows story and comment counts for items with references', () => {
    render(
      <HackerNewsReferencesProvider
        references={{ 'item-1': { story_count: 3, comment_count: 12 } }}
      >
        <HackerNewsReferenceLabel entityId='item-1' />
      </HackerNewsReferencesProvider>,
    )
    expect(screen.getByText('Seen on Hacker News · 3')).toBeInTheDocument()
    expect(screen.getByText('Mentioned · 12')).toBeInTheDocument()
  })

  it('uses the full wording when only comments reference the item', () => {
    render(
      <HackerNewsReferencesProvider references={{ 'item-1': { story_count: 0, comment_count: 2 } }}>
        <HackerNewsReferenceLabel entityId='item-1' />
      </HackerNewsReferencesProvider>,
    )
    expect(screen.getByText('Mentioned on Hacker News · 2')).toBeInTheDocument()
  })

  it('renders nothing without references', () => {
    const { container } = render(
      <HackerNewsReferencesProvider references={undefined}>
        <HackerNewsReferenceLabel entityId='item-1' />
      </HackerNewsReferencesProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('HackerNewsReferencesAside', () => {
  it('links every reference to Hacker News with nofollow', () => {
    render(
      <HackerNewsReferencesAside
        references={{
          story_count: 1,
          comment_count: 1,
          stories: [
            {
              hacker_news_item_id: 11,
              points: 128,
              reply_count: 37,
              posted_at: '2026-01-15T12:00:00Z',
            },
          ],
          comments: [
            {
              hacker_news_item_id: 22,
              parent_story_item_id: 11,
              posted_at: '2026-01-16T09:30:00Z',
            },
          ],
        }}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      'https://news.ycombinator.com/item?id=11',
      'https://news.ycombinator.com/item?id=22',
    ])
    for (const link of links) {
      expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer')
    }
  })

  it('renders nothing when there are no references', () => {
    const { container } = render(<HackerNewsReferencesAside references={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
