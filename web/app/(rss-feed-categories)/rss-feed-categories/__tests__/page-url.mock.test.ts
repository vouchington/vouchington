import { describe, it, expect, vi } from 'vitest'

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
vi.mock(import('@/components/admin/admin-pagination'), () => ({ AdminPagination: () => null }))

import { buildPageUrl } from '../page'

describe('buildPageUrl', () => {
  it('returns base URL with no params', () => {
    expect(buildPageUrl({}, undefined)).toBe('/rss-feed-categories')
  })

  it('includes status param when set', () => {
    expect(buildPageUrl({ status: 'rejected' }, undefined)).toBe(
      '/rss-feed-categories?status=rejected',
    )
  })

  it('includes after cursor when set', () => {
    expect(buildPageUrl({}, 'abc123')).toBe('/rss-feed-categories?after=abc123')
  })

  it('includes both status and after when both set', () => {
    const url = buildPageUrl({ status: 'all' }, 'cursor-1')
    expect(url).toBe('/rss-feed-categories?status=all&after=cursor-1')
  })
})
