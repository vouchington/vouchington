import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        replace: vi.fn<VitestLooseMock>(),
        refresh: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    clearError,
    fetchError,
    onLoadMore,
  }: {
    children: ReactNode
    clearError?: () => void
    fetchError?: Error | null
    onLoadMore: () => Promise<void | boolean>
  }) => (
    <div>
      {children}
      {fetchError ? (
        <div>
          <p role='alert'>Failed to load more</p>
          <button
            type='button'
            onClick={() => {
              clearError?.()
              void onLoadMore()
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  ),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        value,
        onValueChange,
        children,
      }: {
        value: string
        onValueChange: (value: string) => void
        children: ReactNode
      }) => (
        <div>
          <div>{`Filter: ${value}`}</div>
          <button
            type='button'
            onClick={() => onValueChange('resolved')}
          >
            set resolved
          </button>
          {children}
        </div>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
        <div data-value={value}>{children}</div>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/lib/api/client/report-integrity'), () => ({
  resolveReportIntegrityFlag: vi.fn<VitestLooseMock>(),
  applyReportAbusePenalty: vi.fn<VitestLooseMock>(),
}))

const { mockClearError, mockLoadMore } = vi.hoisted(() => ({
  mockClearError: vi.fn<VitestLooseMock>(),
  mockLoadMore: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../use-report-integrity-flags'), () => ({
  useReportIntegrityFlags: vi.fn<VitestLooseMock>(() => ({
    actionError: null,
    actionLoading: {},
    applyPenaltyWithConfirmation: vi.fn<VitestLooseMock>(),
    flags: [],
    handleLoadMore: mockLoadMore,
    handleResolve: vi.fn<VitestLooseMock>(),
    handleRefreshFlags: vi.fn<VitestLooseMock>(),
    handleStatusChange: vi.fn<VitestLooseMock>(),
    penaltyConfirm: {},
    penaltyResults: {},
    isPending: false,
    resolutions: {},
    selectedStatus: 'pending' as const,
    updateResolution: vi.fn<VitestLooseMock>(),
    pages: [
      {
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      },
    ],
    hasNextPage: false,
    endCursor: null,
    fetchError: new Error('Load failed'),
    clearError: mockClearError,
    loadMore: mockLoadMore,
  })),
}))

import { ReportIntegrityFlagsClient } from '../report-integrity-flags-client'

const emptyData = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('ReportIntegrityFlagsClient fetchError handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('announces the load failure when fetchError is set', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={emptyData}
        initialStatus='pending'
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more')
  })

  it('renders Retry button when fetchError is set', () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={emptyData}
        initialStatus='pending'
      />,
    )

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('calls clearError and loadMore when Retry is clicked', async () => {
    render(
      <ReportIntegrityFlagsClient
        initialData={emptyData}
        initialStatus='pending'
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })

    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalled()
      expect(mockLoadMore).toHaveBeenCalled()
    })
  })
})
