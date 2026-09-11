import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WebSearchResultItem } from '../web-search-result-item'
import type { WebSearchResultItem as WebSearchResultItemType } from '@/types/api-responses'

function makeItem(overrides: Partial<WebSearchResultItemType> = {}): WebSearchResultItemType {
  return {
    url: {
      __entity_type: 'url',
      id: 'url-1',
      url: 'https://example.com/article',
      pathname: '/article',
      search_params: {},
      canonical_url_id: null,
      hostname: {
        __entity_type: 'hostname',
        id: 'hostname-1',
        hostname: 'example.com',
        topic_id: null,
      },
    },
    snippet: null,
    match_type: 'url',
    ...overrides,
  }
}

describe('WebSearchResultItem', () => {
  it('renders a link to the external URL', () => {
    render(<WebSearchResultItem result={makeItem()} />)
    const link = screen.getByRole('link', { name: 'https://example.com/article' })
    expect(link.getAttribute('href')).toBe('https://example.com/article')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('renders hostname when present', () => {
    render(<WebSearchResultItem result={makeItem()} />)
    expect(screen.getByText('example.com')).toBeTruthy()
  })

  it('renders snippet with highlighted marks', () => {
    const snippet = 'Some text ⟦MARK⟧highlighted⟦/MARK⟧ more text'
    render(<WebSearchResultItem result={makeItem({ snippet, match_type: 'content' })} />)
    const container = document.querySelector('[data-pw="web-search-result-snippet"]')
    expect(container?.querySelector('mark')?.textContent).toBe('highlighted')
  })

  it('renders surrounding text nodes around marks', () => {
    const snippet = 'Before ⟦MARK⟧word⟦/MARK⟧ after'
    render(<WebSearchResultItem result={makeItem({ snippet, match_type: 'content' })} />)
    const container = document.querySelector('[data-pw="web-search-result-snippet"]')
    expect(container?.textContent).toContain('Before')
    expect(container?.textContent).toContain('word')
    expect(container?.textContent).toContain('after')
  })

  it('renders multiple marks in one snippet', () => {
    const snippet = '⟦MARK⟧first⟦/MARK⟧ gap ⟦MARK⟧second⟦/MARK⟧'
    render(<WebSearchResultItem result={makeItem({ snippet, match_type: 'content' })} />)
    const container = document.querySelector('[data-pw="web-search-result-snippet"]')
    const marks = container?.querySelectorAll('mark') ?? []
    expect(marks).toHaveLength(2)
    expect(marks[0]?.textContent).toBe('first')
    expect(marks[1]?.textContent).toBe('second')
  })

  it('renders URL match hint when snippet is null and match_type is url', () => {
    render(<WebSearchResultItem result={makeItem({ snippet: null, match_type: 'url' })} />)
    expect(screen.getByText('URL match')).toBeTruthy()
  })

  it('does not render snippet area when snippet is null and match_type is content', () => {
    render(<WebSearchResultItem result={makeItem({ snippet: null, match_type: 'content' })} />)
    expect(document.querySelector('[data-pw="web-search-result-snippet"]')).toBeNull()
  })

  it('renders remaining text when a MARK_OPEN has no matching MARK_CLOSE', () => {
    const snippet = 'prefix ⟦MARK⟧no close here'
    render(<WebSearchResultItem result={makeItem({ snippet, match_type: 'content' })} />)
    const container = document.querySelector('[data-pw="web-search-result-snippet"]')
    expect(container?.textContent).toContain('prefix')
    expect(container?.textContent).toContain('no close here')
  })
})
