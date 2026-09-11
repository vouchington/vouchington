import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { SupportThreadsResponse } from '@/types/support'
import { AdminSupportThreadsClient } from '../admin-support-threads-client'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock(import('@/components/admin/admin-page-header'), () => ({
  AdminPageHeader: ({ title, children }: { title: string; children?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock(import('@/components/admin/admin-table-shell'), () => ({
  AdminTableShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))
vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='Filter threads by status'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

const initialData: SupportThreadsResponse = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null },
} as unknown as SupportThreadsResponse
const mockNav = createNavMock()

describe('AdminSupportThreadsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [initialData],
      hasNextPage: false,
      endCursor: null,
      loadingMore: false,
      loadMore: vi.fn<VitestLooseMock>(),
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('initial threads'),
    })
  })

  it('replaces the URL when the status filter changes', async () => {
    render(
      <AdminSupportThreadsClient
        initialData={initialData}
        initialQ={undefined}
        initialStatus={undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('Filter threads by status'), {
      target: { value: 'resolved' },
    })

    await waitFor(() => {
      expect(mockNav.replace).toHaveBeenCalledWith('/support?status=resolved')
    })
  })

  it('preserves the status filter when searching', async () => {
    render(
      <AdminSupportThreadsClient
        initialData={initialData}
        initialQ={undefined}
        initialStatus='open'
      />,
    )
    fireEvent.change(screen.getByLabelText('Search support threads'), {
      target: { value: 'refund request' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockNav.replace).toHaveBeenCalledWith('/support?q=refund+request&status=open')
    })
  })

  it('retries loading more threads after a pagination error', () => {
    const loadMore = vi.fn<VitestLooseMock>()
    const clearError = vi.fn<VitestLooseMock>()
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [initialData],
      hasNextPage: true,
      endCursor: 'cursor-1',
      loadingMore: false,
      loadMore,
      fetchError: new Error('load failed'),
      clearError,
      resetKey: Symbol('failed threads'),
    })

    render(
      <AdminSupportThreadsClient
        initialData={initialData}
        initialQ={undefined}
        initialStatus={undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(clearError).toHaveBeenCalledOnce()
    expect(loadMore).toHaveBeenCalledOnce()
  })
})
