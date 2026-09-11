import type { ReactNode } from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FriendRecommendationsList } from '../friend-recommendations-list'
import type { FriendRecommendationsResponseBody } from '@/types/api-responses'

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

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock(import('@/components/users/user-list'), () => ({
  UserListItem: ({ user, actions }: { user: { username?: string }; actions?: ReactNode }) => (
    <div>
      <span>{user.username}</span>
      {actions}
    </div>
  ),
}))

vi.mock(import('@/components/shared/paginated-list-footer'), () => ({
  PaginatedListFooter: () => null,
}))

import { usePaginatedList } from '@/hooks/use-paginated-list'
import { bookmarkEntity } from '@/lib/api/client/bookmarks'

const mockUsePaginatedList = vi.mocked(usePaginatedList)

const pageInfo = {
  has_next_page: false,
  end_cursor: null,
  start_cursor: null,
} as const

const emptyInitialData = {
  results: [],
  page_info: pageInfo,
  users: {},
} as unknown as FriendRecommendationsResponseBody

function setupEmptyList() {
  mockUsePaginatedList.mockReturnValue({
    pages: [{ results: [], page_info: pageInfo, users: {} }] as unknown[],
    hasNextPage: false,
    loadingMore: false,
    endCursor: null,
    loadMore: vi.fn<() => Promise<void>>(),
    fetchError: null,
    clearError: vi.fn<() => void>(),
    resetKey: Symbol('friend recommendations'),
  } as ReturnType<typeof mockUsePaginatedList>)
}

describe('FriendRecommendationsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('empty state contains a link to /my/identity#social', () => {
    setupEmptyList()
    render(<FriendRecommendationsList initialData={emptyInitialData} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/my/identity#social')
  })

  it('empty state link has correct data-pw', () => {
    setupEmptyList()
    const { container } = render(<FriendRecommendationsList initialData={emptyInitialData} />)
    expect(
      container.querySelector('[data-pw="friend-recommendations-empty-identity-link"]'),
    ).toBeTruthy()
  })

  it('empty state link text mentions Facebook, X, and GitHub', () => {
    setupEmptyList()
    render(<FriendRecommendationsList initialData={emptyInitialData} />)
    const link = screen.getByRole('link')
    expect(link.textContent).toContain('Facebook')
    expect(link.textContent).toContain('X')
    expect(link.textContent).toContain('GitHub')
  })

  it('optimistically removes a dismissal and restores it when the mutation fails', async () => {
    const page = setupRecommendation()
    vi.mocked(bookmarkEntity).mockRejectedValueOnce(new Error('network'))

    render(
      <FriendRecommendationsList
        initialData={page as unknown as FriendRecommendationsResponseBody}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('alice')).toBeNull()
    await waitFor(() => expect(screen.getByText('alice')).toBeVisible())
  })

  it('optimistically follows a recommendation and suppresses duplicate actions', () => {
    const page = setupRecommendation()
    vi.mocked(bookmarkEntity).mockReturnValue(
      new Promise<Awaited<ReturnType<typeof bookmarkEntity>>>(() => {}),
    )

    render(
      <FriendRecommendationsList
        initialData={page as unknown as FriendRecommendationsResponseBody}
      />,
    )
    const follow = screen.getByRole('button', { name: 'Follow' })
    fireEvent.click(follow)
    fireEvent.click(follow)

    expect(bookmarkEntity).toHaveBeenCalledTimes(1)
    expect(bookmarkEntity).toHaveBeenCalledWith('user', 'user-1', 'follow')
    expect(screen.queryByText('alice')).toBeNull()
  })

  it('restores a recommendation when following fails', async () => {
    const page = setupRecommendation()
    vi.mocked(bookmarkEntity).mockRejectedValueOnce(new Error('network'))

    render(
      <FriendRecommendationsList
        initialData={page as unknown as FriendRecommendationsResponseBody}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))

    expect(screen.queryByText('alice')).toBeNull()
    await waitFor(() => expect(screen.getByText('alice')).toBeVisible())
  })

  it('preserves provider identity and actions when the user reference is missing', () => {
    const page = setupRecommendation({ includeUser: false })

    render(
      <FriendRecommendationsList
        initialData={page as unknown as FriendRecommendationsResponseBody}
      />,
    )

    expect(screen.getByText('Alice')).toBeVisible()
    expect(screen.getByText('via GitHub')).toBeVisible()
    expect(screen.queryByRole('link')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    expect(bookmarkEntity).toHaveBeenCalledWith('user', 'user-1', 'follow')
  })
})

function setupRecommendation(options: { includeUser?: boolean } = {}) {
  const page = {
    results: [
      {
        __entity_type: 'user',
        id: 'user-1',
        provider: 'github',
        provider_friend_name: 'Alice',
      },
    ],
    page_info: pageInfo,
    users: options.includeUser === false ? {} : { 'user-1': { id: 'user-1', username: 'alice' } },
  }
  mockUsePaginatedList.mockReturnValue({
    pages: [page],
    hasNextPage: false,
    loadingMore: false,
    endCursor: null,
    loadMore: vi.fn<() => Promise<void>>(),
    fetchError: null,
    clearError: vi.fn<() => void>(),
    resetKey: Symbol('friend recommendations'),
  } as ReturnType<typeof mockUsePaginatedList>)
  return page
}
