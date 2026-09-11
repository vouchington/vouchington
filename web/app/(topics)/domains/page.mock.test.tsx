import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DomainsPage from './page'

const mockGetCurrentUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetHostnames = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockPageHeader = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [key: string]: unknown
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

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/api/server/hostnames'), () => ({
  getHostnames: mockGetHostnames,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: (props: { title: string; description?: string }) => {
    mockPageHeader(props)
    return (
      <header>
        <h1>{props.title}</h1>
        {props.description && <p>{props.description}</p>}
      </header>
    )
  },
}))

vi.mock(import('@/components/domains/domains-search-form'), () => ({
  DomainsSearchForm: () => <div>domain search form</div>,
}))

vi.mock(import('@/components/domains/block-hostname-quick-add'), () => ({
  BlockHostnameQuickAdd: () => null,
}))

vi.mock(import('./domains-list-client'), () => ({
  DomainsListClient: () => <div>domains list</div>,
}))

vi.mock(
  import('@/components/hostnames/hostname-vouch-disavow-vote'),
  () =>
    ({
      HostnameVouchDisavowVote: () => null,
    }) as unknown as typeof import('@/components/hostnames/hostname-vouch-disavow-vote'),
)

vi.mock(
  import('@/components/domains/domain-trust-badge'),
  () =>
    ({
      DomainTrustBadge: () => null,
    }) as unknown as typeof import('@/components/domains/domain-trust-badge'),
)

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('@/components/topics/topic-label'), () => ({
  TopicLabel: ({ topic }: { topic: { name: string } }) => <span>{topic.name}</span>,
}))

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createCollectionPageSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

describe('DomainsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetHostnames.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      hostnames: {},
      topics: {},
      hostname_elections: {},
      election_votes: {},
    })
  })

  it('renders the list page heading through the shared PageHeader', async () => {
    const ui = await DomainsPage({ searchParams: Promise.resolve({}) })

    render(ui)

    expect(mockPageHeader).toHaveBeenCalledWith({
      title: 'Domains',
      description: 'Search domains, inspect the linked topic, and vote on domain authority.',
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Domains' })).toBeVisible()
    expect(
      screen.getByText('Search domains, inspect the linked topic, and vote on domain authority.'),
    ).toBeVisible()
  })
})
