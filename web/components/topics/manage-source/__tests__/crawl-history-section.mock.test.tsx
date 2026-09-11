import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CrawlHistorySection } from '../crawl-history-section'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('CrawlHistorySection', () => {
  it('renders empty state when no crawls', () => {
    render(
      <CrawlHistorySection
        crawls={[]}
        crawlsHref='/source/topic-1/crawls'
        crawlDetailHrefBase='/source/topic-1/crawls/'
        newsHref='/source/topic-1/news'
      />,
    )
    expect(screen.getByText('No crawls yet')).toBeInTheDocument()
  })

  it('renders crawl rows with links when crawls exist', () => {
    const crawls = [
      { id: 'crawl-1', response_code: 200, created_at: '2026-01-15T12:00:00.000Z' },
      { id: 'crawl-2', response_code: 404, created_at: '2026-01-14T10:00:00.000Z' },
    ]
    render(
      <CrawlHistorySection
        crawls={crawls}
        crawlsHref='/source/topic-1/crawls'
        crawlDetailHrefBase='/source/topic-1/crawls/'
        newsHref='/source/topic-1/news'
      />,
    )
    const crawlLinks = screen.getAllByRole('link', { name: /View crawl from/ })
    expect(crawlLinks).toHaveLength(2)
    expect(crawlLinks[0]!.getAttribute('href')).toBe('/source/topic-1/crawls/crawl-1')
    expect(crawlLinks[1]!.getAttribute('href')).toBe('/source/topic-1/crawls/crawl-2')

    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('renders view-all and view-items links', () => {
    render(
      <CrawlHistorySection
        crawls={[]}
        crawlsHref='/source/topic-1/crawls'
        crawlDetailHrefBase='/source/topic-1/crawls/'
        newsHref='/source/topic-1/news'
      />,
    )
    expect(screen.getByRole('link', { name: 'View all crawls' }).getAttribute('href')).toBe(
      '/source/topic-1/crawls',
    )
    expect(screen.getByRole('link', { name: 'View ingested items' }).getAttribute('href')).toBe(
      '/source/topic-1/news',
    )
  })
})
