import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import { getAdminRssFeedCategories } from '@/lib/api/server/rss-feed-categories'
import { beforeEach, describe, it, expect, vi } from 'vitest'

vi.mock(import('@/lib/api/server/rss-feed-categories'), () => ({
  getAdminRssFeedCategories: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(
  import('../status-filter'),
  () =>
    ({ RssFeedCategoryStatusFilter: () => null }) as unknown as typeof import('../status-filter'),
)
vi.mock(
  import('../category-row-actions'),
  () => ({ CategoryRowActions: () => null }) as unknown as typeof import('../category-row-actions'),
)
vi.mock(import('@/components/ui/breadcrumb'), () => ({ Breadcrumbs: () => null }))
vi.mock(
  import('@/components/admin/admin-page-header'),
  () =>
    ({
      AdminPageHeader: () => null,
    }) as unknown as typeof import('@/components/admin/admin-page-header'),
)
vi.mock(
  import('@/components/admin/admin-table-shell'),
  () =>
    ({
      AdminTableShell: () => null,
    }) as unknown as typeof import('@/components/admin/admin-table-shell'),
)

import RssFeedCategoriesPage from '../page'

describe('RSS feed category page pagination', () => {
  beforeEach(() => {
    vi.mocked(getAdminRssFeedCategories).mockResolvedValue({
      results: [],
      page_info: {
        has_next_page: true,
        start_cursor: 'start',
        end_cursor: 'cursor-1',
      },
    })
  })

  it('links back to the base URL when clearing the current cursor', async () => {
    render(await RssFeedCategoriesPage({ searchParams: Promise.resolve({ after: 'old-cursor' }) }))
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/rss-feed-categories',
    )
  })

  it('preserves status when clearing the current cursor', async () => {
    render(
      await RssFeedCategoriesPage({
        searchParams: Promise.resolve({ status: 'rejected', after: 'old-cursor' }),
      }),
    )
    expect(getAdminRssFeedCategories).toHaveBeenLastCalledWith({
      searchParams: { status: 'rejected', after: 'old-cursor', limit: 25 },
    })
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/rss-feed-categories?status=rejected',
    )
  })

  it('links forward with the returned cursor', async () => {
    render(await RssFeedCategoriesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/rss-feed-categories?after=cursor-1',
    )
  })

  it('preserves status on the next-page link', async () => {
    render(await RssFeedCategoriesPage({ searchParams: Promise.resolve({ status: 'all' }) }))
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/rss-feed-categories?status=all&after=cursor-1',
    )
  })
})
