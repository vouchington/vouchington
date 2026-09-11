import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCrawler, mockNotFound } = vi.hoisted(() => ({
  mockGetCrawler: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(import('@/lib/api/server'), () => ({ getCrawler: mockGetCrawler }))
vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

import Page from '../page'

const baseCrawler = {
  crawler_type: 'firecrawl',
  priority: 5,
  description: 'A crawler',
  css_selectors_to_remove: [] as string[],
  link_text_content_to_remove: [] as string[],
  link_hrefs_to_remove: [] as string[],
}

describe('CrawlerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders crawler config with list items when arrays are non-empty', async () => {
    mockGetCrawler.mockResolvedValue({
      crawler: {
        ...baseCrawler,
        css_selectors_to_remove: ['.ad'],
        link_text_content_to_remove: ['Sponsored'],
        link_hrefs_to_remove: ['/promo'],
      },
    })
    render(await Page({ params: Promise.resolve({ id: 'crawler-1' }) }))
    expect(screen.getByText('Crawler Details')).toBeInTheDocument()
    expect(screen.getByText('firecrawl')).toBeInTheDocument()
    expect(screen.getByText('.ad')).toBeInTheDocument()
    expect(screen.getByText('Sponsored')).toBeInTheDocument()
    expect(screen.getByText('/promo')).toBeInTheDocument()
    const editLink = screen.getByRole('link', { name: 'Edit Crawler' })
    expect(editLink.getAttribute('href')).toBe('/crawler/crawler-1/edit')
  })

  it('renders "None" placeholders when the arrays are empty', async () => {
    mockGetCrawler.mockResolvedValue({ crawler: baseCrawler })
    render(await Page({ params: Promise.resolve({ id: 'crawler-1' }) }))
    expect(screen.getAllByText('None')).toHaveLength(3)
  })

  it('calls notFound when the crawler does not exist', async () => {
    mockGetCrawler.mockResolvedValue(null)
    await expect(Page({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mockNotFound).toHaveBeenCalled()
  })
})
