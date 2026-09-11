import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCrawlers, mockNotFound, mockRequireAdmin } = vi.hoisted(() => ({
  mockGetCrawlers: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  mockRequireAdmin: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({ getCrawlers: mockGetCrawlers }))
vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mockRequireAdmin }))
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

import CrawlersListPage from '../page'

const baseCrawler = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  hostname_id: 'hid-1',
  description: 'A test crawler',
  crawler_type: 'fetch',
  priority: 5,
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('CrawlersListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue({ id: 'admin', roles: ['administrator'] })
  })

  it('renders empty state when no crawlers', async () => {
    mockGetCrawlers.mockResolvedValue({ results: [] })
    render(await CrawlersListPage())
    expect(screen.getByText('No crawlers configured')).toBeInTheDocument()
  })

  it('renders crawler table when crawlers exist', async () => {
    mockGetCrawlers.mockResolvedValue({ results: [baseCrawler] })
    render(await CrawlersListPage())
    expect(screen.getByText('Crawlers')).toBeInTheDocument()
    expect(screen.getByText('fetch')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('propagates error when getCrawlers throws', async () => {
    mockGetCrawlers.mockRejectedValue(new Error('network error'))
    await expect(CrawlersListPage()).rejects.toThrow('network error')
  })
})
