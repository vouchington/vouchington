import type { ReactNode } from 'react'
import { vi } from 'vitest'

const { mockGetRssFeeds, mockGetListSearchErrorMessage } = vi.hoisted(() => ({
  mockGetRssFeeds: vi.fn<VitestLooseMock>(),
  mockGetListSearchErrorMessage: vi.fn<VitestLooseMock>().mockReturnValue(null),
}))

vi.mock(import('@/lib/api/server/rss-feeds'), () => ({
  getRssFeeds: mockGetRssFeeds,
}))

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(
  import('@/lib/api/list-search-error'),
  () =>
    ({
      getListSearchErrorMessage: mockGetListSearchErrorMessage,
      isListSearchErrorResult: (v: unknown) =>
        v != null &&
        typeof v === 'object' &&
        'error' in v &&
        typeof (v as { error: unknown }).error === 'string',
    }) as unknown as typeof import('@/lib/api/list-search-error'),
)

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createCollectionPageSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createItemListSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('@/components/shared/list-search-error'), () => ({
  ListSearchError: ({ message }: { message: string }) => <p data-pw='search-error'>{message}</p>,
}))

vi.mock(import('@/components/sources/add-source-button'), () => ({
  AddSourceButton: () => (
    // ast-grep-ignore: web-no-raw-form-elements -- test double replaces AddSourceButton with a button the source listing tests query
    <button type='button'>mock-add-source</button>
  ),
}))

export { mockGetListSearchErrorMessage, mockGetRssFeeds }
