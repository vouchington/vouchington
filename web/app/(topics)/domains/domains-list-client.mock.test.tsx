import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainsListClient } from './domains-list-client'
import type { HostnameListResponse } from '@/types/hostnames'

const { mockUsePaginatedList } = vi.hoisted(() => ({
  mockUsePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

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

vi.mock(import('@/components/topics/topic-label'), () => ({
  TopicLabel: ({ topic }: { topic: { name: string } }) => <span>{topic.name}</span>,
}))

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

const PAGE_INFO = { has_next_page: false, end_cursor: null, start_cursor: null }

const EMPTY_DATA: HostnameListResponse = {
  results: [],
  page_info: PAGE_INFO,
  hostnames: {},
  topics: {},
  hostname_elections: {},
  election_votes: {},
}

const DATA_WITH_RESULTS: HostnameListResponse = {
  results: [{ __entity_type: 'hostname', id: 'hn-1' }],
  page_info: PAGE_INFO,
  hostnames: {
    'hn-1': { __entity_type: 'hostname', id: 'hn-1', hostname: 'example.com', topic_id: null },
  },
  topics: {},
  hostname_elections: {},
  election_votes: {},
}

describe('DomainsListClient', () => {
  beforeEach(() => {
    mockUsePaginatedList.mockReset()
  })

  it('shows empty state when there are no results', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [EMPTY_DATA],
      hasNextPage: false,
      loadingMore: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
    })
    render(
      <DomainsListClient
        initialData={EMPTY_DATA}
        isAdmin={false}
        signedIn={false}
        searchParams={{}}
      />,
    )
    expect(screen.getByText('No domains found')).toBeVisible()
  })

  it('renders hostname cards when results exist', () => {
    mockUsePaginatedList.mockReturnValue({
      pages: [DATA_WITH_RESULTS],
      hasNextPage: false,
      loadingMore: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
    })
    render(
      <DomainsListClient
        initialData={DATA_WITH_RESULTS}
        isAdmin={false}
        signedIn={false}
        searchParams={{}}
      />,
    )
    expect(screen.getByText('example.com')).toBeVisible()
  })
})
