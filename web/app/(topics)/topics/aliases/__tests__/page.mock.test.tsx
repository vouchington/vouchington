import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetTopicAliasesSearch, mockRequireAdmin } = vi.hoisted(() => ({
  mockGetTopicAliasesSearch: vi.fn<VitestLooseMock>(),
  mockRequireAdmin: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-admin'), () => ({ requireAdmin: mockRequireAdmin }))
vi.mock(import('@/lib/api/server'), () => ({ getTopicAliasesSearch: mockGetTopicAliasesSearch }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock(import('@/components/shared/client-search-form'), () => ({
  ClientSearchForm: () => <div data-testid='client-search-form' />,
}))
vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

import Page from '../page'

describe('TopicAliasesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue({ id: 'admin', roles: ['administrator'] })
  })

  it('propagates the requireAdmin redirect for non-admins', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockGetTopicAliasesSearch).not.toHaveBeenCalled()
  })

  it('renders the heading and form without searching when there is no query', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: 'Topic Aliases' })).toBeInTheDocument()
    expect(screen.getByTestId('client-search-form')).toBeInTheDocument()
    expect(mockGetTopicAliasesSearch).not.toHaveBeenCalled()
    expect(screen.queryByText('No aliases found')).not.toBeInTheDocument()
  })

  it('renders the empty-results branch when a query returns nothing', async () => {
    mockGetTopicAliasesSearch.mockResolvedValue({ results: [] })
    render(await Page({ searchParams: Promise.resolve({ q: 'amex' }) }))
    expect(mockGetTopicAliasesSearch).toHaveBeenCalledWith({ q: 'amex', limit: '24' })
    expect(screen.getByText('No aliases found')).toBeInTheDocument()
  })

  it('renders a results row with an edit link when a query returns matches', async () => {
    mockGetTopicAliasesSearch.mockResolvedValue({
      results: [
        {
          topic_id: 't1',
          alias: 'amx',
          topic: { id: 't1', name: 'American Express', slug: 'amex', topic_type: 'topic' },
        },
      ],
    })
    render(await Page({ searchParams: Promise.resolve({ q: 'amex' }) }))
    expect(mockGetTopicAliasesSearch).toHaveBeenCalledWith({ q: 'amex', limit: '24' })
    expect(screen.getByText('American Express')).toBeInTheDocument()
    expect(screen.getByText('amx')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Edit Aliases' })
    expect(link.getAttribute('href')).toContain('/settings/aliases')
  })
})
