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
vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))
vi.mock(import('../crawler-edit-form'), () => ({
  CrawlerEditForm: ({ crawlerId }: { crawlerId: string }) => (
    <form data-testid={`crawler-edit-form:${crawlerId}`} />
  ),
}))

import Page from '../page'

describe('EditCrawlerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the edit form when the crawler exists', async () => {
    mockGetCrawler.mockResolvedValue({
      crawler: { crawler_type: 'firecrawl', priority: 5 },
    })
    render(await Page({ params: Promise.resolve({ id: 'crawler-1' }) }))
    expect(screen.getByRole('heading', { name: 'Edit Crawler' })).toBeInTheDocument()
    expect(screen.getByTestId('crawler-edit-form:crawler-1')).toBeInTheDocument()
  })

  it('calls notFound when the crawler does not exist', async () => {
    mockGetCrawler.mockResolvedValue(null)
    await expect(Page({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mockNotFound).toHaveBeenCalled()
  })
})
