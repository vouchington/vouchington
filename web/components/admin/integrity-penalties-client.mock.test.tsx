import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type {
  IntegrityPenaltiesState,
  IntegrityPenaltyRecord,
  IntegrityPenaltyStatus,
} from './use-integrity-penalties'

const { mockUseIntegrityPenalties } = vi.hoisted(() => ({
  mockUseIntegrityPenalties: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('./use-integrity-penalties'), async importOriginal => ({
  ...(await importOriginal()),
  useIntegrityPenalties: mockUseIntegrityPenalties,
}))

vi.mock(import('@/components/admin/admin-page-header'), () => {
  const AdminPageHeader: (typeof import('@/components/admin/admin-page-header'))['AdminPageHeader'] =
    ({ children, title }) => <header aria-label={title}>{children}</header>
  return { AdminPageHeader }
})

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    hasNextPage,
    onLoadMore,
  }: {
    children: ReactNode
    hasNextPage: boolean
    onLoadMore: () => Promise<void | boolean>
  }) => (
    <>
      {children}
      {hasNextPage ? (
        <button
          type='button'
          onClick={() => void onLoadMore()}
        >
          Load next page
        </button>
      ) : null}
    </>
  ),
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
        onValueChange: (value: string) => void
        value: string
      }) => (
        <select
          aria-label='Penalty status'
          value={value}
          onChange={event => onValueChange(event.currentTarget.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

interface MockIntegrityPenaltyRowProps<P extends IntegrityPenaltyRecord> {
  domain: 'report' | 'vote'
  initialStatus: IntegrityPenaltyStatus
  multiplier: string | null
  penalty: P
  state: IntegrityPenaltiesState<P>
  reconciliationTestId?: string
  revokeTestId?: string
}

vi.mock(import('./integrity-penalty-row'), () => {
  const IntegrityPenaltyRow: (typeof import('./integrity-penalty-row'))['IntegrityPenaltyRow'] = <
    P extends IntegrityPenaltyRecord,
  >({
    multiplier,
    penalty,
  }: MockIntegrityPenaltyRowProps<P>) => (
    <tr>
      <td>{penalty.id}</td>
      <td>{multiplier}</td>
    </tr>
  )
  return { IntegrityPenaltyRow }
})

import { IntegrityPenaltiesClient } from './integrity-penalties-client'

interface Penalty extends IntegrityPenaltyRecord {
  multiplier: number
}

type MockIntegrityPenaltiesState = IntegrityPenaltiesState<Penalty> & {
  clearError: Mock<() => void>
  loadMore: Mock<() => Promise<void>>
}

const penalty: Penalty = {
  id: 'penalty-1',
  user_id: 'user-1',
  reason: 'voting_ring',
  source_flag_id: 'flag-1',
  created_by_id: 'admin-1',
  revoked_at: null,
  revoked_by_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  multiplier: 2,
}

const initialData = {
  results: [penalty],
  page_info: { has_next_page: true, end_cursor: 'cursor-1', start_cursor: null },
}

function makeState(
  overrides: Partial<Omit<MockIntegrityPenaltiesState, 'clearError' | 'loadMore'>> = {},
): MockIntegrityPenaltiesState {
  const clearError = vi.fn<() => void>()
  const loadMore = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const state = {
    pages: [initialData],
    penalties: [penalty],
    hasNextPage: true,
    endCursor: 'cursor-1',
    fetchError: null,
    clearError,
    loadMore,
    loadingMore: false,
    actionErrors: {},
    actionLoading: {},
    confirming: {},
    handleRefresh: vi.fn<VitestLooseMock>(),
    handleStatusChange: vi.fn<VitestLooseMock>(),
    isPending: false,
    reconcile: vi.fn<VitestLooseMock>(),
    reconciliationRequired: {},
    revokeWithConfirmation: vi.fn<VitestLooseMock>(),
    scopeAvailable: true,
    selectedStatus: 'active',
    ...overrides,
    resetKey: Symbol('integrity-penalties-pagination'),
  } satisfies MockIntegrityPenaltiesState
  return state
}

function renderClient(domain: 'report' | 'vote' = 'report') {
  return render(
    <IntegrityPenaltiesClient
      domain={domain}
      endpoint={`/api/v1/${domain}-integrity/penalties`}
      flagsPath={`/${domain}-integrity/flags`}
      initialData={initialData}
      initialStatus='active'
      multiplier={item => `${item.multiplier}x`}
      penaltiesPath={`/${domain}-integrity/penalties`}
      getById={vi.fn<VitestLooseMock>()}
      revoke={vi.fn<VitestLooseMock>()}
    />,
  )
}

describe('IntegrityPenaltiesClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('explains an unavailable report scope and renders the empty report table shape', () => {
    mockUseIntegrityPenalties.mockReturnValue(
      makeState({ scopeAvailable: false, penalties: [], hasNextPage: false }),
    )

    renderClient()

    expect(
      screen.getByText('Report penalties are unavailable until the API is upgraded.'),
    ).toBeVisible()
    expect(screen.getByText('No penalties found')).toBeVisible()
    expect(screen.queryByRole('columnheader', { name: /multiplier/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load next page' })).not.toBeInTheDocument()
  })

  it('clears a pagination error before retrying and keeps automatic pagination paused', () => {
    const state = makeState({ fetchError: new Error('network unavailable') })
    mockUseIntegrityPenalties.mockReturnValue(state)

    renderClient()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(state.clearError).toHaveBeenCalledOnce()
    expect(state.loadMore).toHaveBeenCalledOnce()
    expect(state.clearError.mock.invocationCallOrder[0]).toBeLessThan(
      state.loadMore.mock.invocationCallOrder[0]!,
    )
    expect(screen.queryByRole('button', { name: 'Load next page' })).not.toBeInTheDocument()
  })

  it('renders vote-only data and delegates pagination, filtering, and refresh', () => {
    const state = makeState()
    mockUseIntegrityPenalties.mockReturnValue(state)

    renderClient('vote')
    fireEvent.click(screen.getByRole('button', { name: 'Load next page' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Penalty status' }), {
      target: { value: 'revoked' },
    })
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    expect(screen.getByRole('columnheader', { name: /multiplier/i })).toBeVisible()
    expect(screen.getByText('2x')).toBeVisible()
    expect(state.loadMore).toHaveBeenCalledOnce()
    expect(state.handleStatusChange).toHaveBeenCalledWith('revoked')
    expect(state.handleRefresh).toHaveBeenCalledOnce()
  })

  it('pauses pagination and disables refresh while a transition is pending', () => {
    mockUseIntegrityPenalties.mockReturnValue(makeState({ isPending: true }))

    renderClient('vote')

    expect(screen.queryByRole('button', { name: 'Load next page' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()
  })
})
