import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { ReferralClicksPage } from '../referral-clicks-page'
import type { ReferralClickLogResponseBody } from '@/types/api-responses'
import { getPaginatedPage } from '@/lib/api/client'

const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    onLoadMore,
  }: {
    children: ReactNode
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore: () => Promise<void | boolean>
    resetKey?: unknown
  }) => {
    mockReceiveLoadMore(onLoadMore)
    return <div>{children}</div>
  },
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

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <time dateTime={date}>{date}</time>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

const emptyData: ReferralClickLogResponseBody = {
  results: [],
  clicks: {},
  users: {},
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

const clickId = 'click-1'
const userId = 'user-1'

const dataWithResults: ReferralClickLogResponseBody = {
  results: [{ __entity_type: 'referral_click_log', id: clickId }],
  clicks: {
    [clickId]: {
      __entity_type: 'referral_click_log',
      id: clickId,
      landing_url: 'https://example.com/landing',
      user_id: userId,
      signed_up_at: '2024-01-15T10:00:00.000Z',
      created_at: '2024-01-15T10:00:00.000Z',
    },
  },
  users: {
    [userId]: {
      id: userId,
      username: 'johndoe',
    },
  },
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('ReferralClicksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no results', () => {
    render(<ReferralClicksPage initialData={emptyData} />)
    expect(screen.getByText('No referral clicks yet.')).toBeInTheDocument()
  })

  it('renders table with click data', () => {
    render(<ReferralClicksPage initialData={dataWithResults} />)
    expect(screen.getByText('example.com/landing')).toBeInTheDocument()
  })

  it('renders username link when user has a username', () => {
    render(<ReferralClicksPage initialData={dataWithResults} />)
    const link = screen.getByRole('link', { name: '@johndoe' })
    expect(link).toHaveAttribute('href', '/user/johndoe')
  })

  it('shows Anonymous when signed up but no username', () => {
    const data: ReferralClickLogResponseBody = {
      ...dataWithResults,
      users: {},
      clicks: {
        [clickId]: {
          ...dataWithResults.clicks[clickId]!,
          user_id: null,
        },
      },
    }
    render(<ReferralClicksPage initialData={data} />)
    expect(screen.getByText('Anonymous')).toBeInTheDocument()
  })

  it('shows dash when not signed up', () => {
    const data: ReferralClickLogResponseBody = {
      ...dataWithResults,
      users: {},
      clicks: {
        [clickId]: {
          ...dataWithResults.clicks[clickId]!,
          user_id: null,
          signed_up_at: null,
        },
      },
    }
    render(<ReferralClicksPage initialData={data} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('appends results when the next page is loaded', async () => {
    const secondClickId = 'click-2'
    const nextPage: ReferralClickLogResponseBody = {
      results: [{ __entity_type: 'referral_click_log', id: secondClickId }],
      clicks: {
        [secondClickId]: {
          __entity_type: 'referral_click_log',
          id: secondClickId,
          landing_url: 'https://other.com/page',
          user_id: null,
          signed_up_at: null,
          created_at: '2024-01-16T10:00:00.000Z',
        },
      },
      users: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(nextPage)

    const data: ReferralClickLogResponseBody = {
      ...dataWithResults,
      page_info: { has_next_page: true, end_cursor: 'cursor-abc', start_cursor: null },
    }
    render(<ReferralClicksPage initialData={data} />)

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('other.com/page')).toBeInTheDocument()
    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/my/referral-clicks', {
      after: 'cursor-abc',
    })
  })
})
