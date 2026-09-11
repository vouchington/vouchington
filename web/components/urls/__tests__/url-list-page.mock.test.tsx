import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { UrlListPage } from '../url-list-page'
import type { UrlListResponseBody } from '@/types/api-responses'
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

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
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

function makePage(
  id: string,
  url: string,
  hasNextPage: boolean,
  endCursor: string | null,
): UrlListResponseBody {
  return {
    results: [
      {
        __entity_type: 'url',
        id,
        url,
        pathname: '/path',
        hostname: { id: 'host-1', hostname: 'example.com' },
      },
    ],
    page_info: { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null },
  }
}

describe('UrlListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders urls from the initial page', () => {
    render(
      <UrlListPage
        data={makePage('url-1', 'https://example.com/one', false, null)}
        nextPageParams={{ query: 'example', limit: 50 }}
      />,
    )

    expect(screen.getByText('https://example.com/one')).toBeInTheDocument()
  })

  it('appends urls from the next cursor page', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(
      makePage('url-2', 'https://example.com/two', false, null),
    )

    render(
      <UrlListPage
        data={makePage('url-1', 'https://example.com/one', true, 'cursor-1')}
        nextPageParams={{ query: 'example', hostnameId: 'host-1', limit: 50 }}
      />,
    )

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('https://example.com/two')).toBeInTheDocument()
    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/urls', {
      query: 'example',
      hostnameId: 'host-1',
      limit: 50,
      after: 'cursor-1',
    })
  })
})
