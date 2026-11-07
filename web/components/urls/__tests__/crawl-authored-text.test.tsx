import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CrawlAuthoredText } from '../crawl-authored-text'

describe('CrawlAuthoredText', () => {
  it('normalizes a regional page language onto the markdown block', () => {
    render(
      <CrawlAuthoredText
        as='pre'
        lang='en-US'
        text='Page markdown'
      />,
    )

    const markdown = screen.getByText('Page markdown')
    expect(markdown.tagName).toBe('PRE')
    expect(markdown).toHaveAttribute('lang', 'en')
    expect(markdown).toHaveAttribute('dir', 'ltr')
  })

  it('keeps an unsupported page language outside the UI locale', () => {
    render(
      <CrawlAuthoredText
        as='dd'
        lang='und'
        text='Untitled crawl title'
      />,
    )

    const title = screen.getByText('Untitled crawl title')
    expect(title.tagName).toBe('DD')
    expect(title).not.toHaveAttribute('lang')
    expect(title).toHaveAttribute('dir', 'auto')
  })

  it('omits lang when the crawl has no page language', () => {
    render(
      <CrawlAuthoredText
        as='pre'
        lang={null}
        text='Markdown without a page language'
      />,
    )

    const markdown = screen.getByText('Markdown without a page language')
    expect(markdown).not.toHaveAttribute('lang')
    expect(markdown).toHaveAttribute('dir', 'auto')
  })
})
