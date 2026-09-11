import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

configure({ testIdAttribute: 'data-pw' })

const { mockFetchStats, mockOnError } = vi.hoisted(() => ({
  mockFetchStats: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/community-moderator-stats'), () => ({
  fetchCommunityModeratorStats: mockFetchStats,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(
  import('@/components/shared/user-avatar'),
  () =>
    ({
      UserAvatar: () => null,
    }) as unknown as typeof import('@/components/shared/user-avatar'),
)

vi.mock(
  import('@/components/ui/card'),
  () =>
    ({
      Card: ({ children }: any) => <div>{children}</div>,
      CardContent: ({ children }: any) => <div>{children}</div>,
      CardHeader: ({ children }: any) => <div>{children}</div>,
      CardTitle: ({ children, ...props }: any) => <div {...props}>{children}</div>,
      CardDescription: ({ children }: any) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/card'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children, onClick, disabled, ...props }: any) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

import { CommunityModeratorStatsPanel } from '../community-moderator-stats-panel'

const initialData = { window: 30 as const, stats: [], users: {} }

describe('CommunityModeratorStatsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockFetchStats.mockResolvedValue({ window: 30, stats: [], users: {} })
  })

  it('renders the heading with data-pw attribute', () => {
    render(
      <CommunityModeratorStatsPanel
        communitySlug='credit-cards'
        initialData={initialData}
      />,
    )
    expect(screen.getByTestId('community-moderator-stats-heading')).toBeInTheDocument()
  })

  it('clicking the 90-day button triggers fetchCommunityModeratorStats with window=90', async () => {
    mockFetchStats.mockResolvedValueOnce({ window: 90, stats: [], users: {} })
    render(
      <CommunityModeratorStatsPanel
        communitySlug='credit-cards'
        initialData={initialData}
      />,
    )

    fireEvent.click(screen.getByTestId('moderator-stats-window-90'))

    await waitFor(() => {
      expect(mockFetchStats).toHaveBeenCalledWith('credit-cards', 90)
      expect(screen.getByTestId('moderator-stats-window-90')).toHaveAttribute('variant', 'default')
      expect(screen.getByTestId('moderator-stats-window-90')).not.toBeDisabled()
      expect(screen.getByTestId('moderator-stats-window-30')).not.toBeDisabled()
    })
  })

  it('after 90-day fetch updates data, clicking 30-day triggers fetch with window=30', async () => {
    mockFetchStats.mockResolvedValueOnce({ window: 90, stats: [], users: {} })
    render(
      <CommunityModeratorStatsPanel
        communitySlug='credit-cards'
        initialData={initialData}
      />,
    )

    fireEvent.click(screen.getByTestId('moderator-stats-window-90'))

    // Wait for the fetch, state update, and transition completion before clicking again.
    await waitFor(() => {
      expect(mockFetchStats).toHaveBeenCalledWith('credit-cards', 90)
      expect(screen.getByTestId('moderator-stats-window-90')).toHaveAttribute('variant', 'default')
      expect(screen.getByTestId('moderator-stats-window-30')).not.toBeDisabled()
    })

    mockFetchStats.mockClear()
    mockFetchStats.mockResolvedValueOnce({ window: 30, stats: [], users: {} })
    fireEvent.click(screen.getByTestId('moderator-stats-window-30'))

    await waitFor(() => {
      expect(mockFetchStats).toHaveBeenCalledTimes(1)
      expect(mockFetchStats).toHaveBeenCalledWith('credit-cards', 30)
      expect(screen.getByTestId('moderator-stats-window-30')).toHaveAttribute('variant', 'default')
      expect(screen.getByTestId('moderator-stats-window-30')).not.toBeDisabled()
    })
  })

  it('calls onError when fetch rejects', async () => {
    const error = new Error('network failure')
    mockFetchStats.mockRejectedValue(error)
    render(
      <CommunityModeratorStatsPanel
        communitySlug='credit-cards'
        initialData={initialData}
      />,
    )

    fireEvent.click(screen.getByTestId('moderator-stats-window-90'))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ fallback: 'Could not load moderator stats.' }),
      )
      expect(screen.getByTestId('moderator-stats-window-90')).not.toBeDisabled()
    })
  })

  it('Other column shows total minus sum of displayed action types', async () => {
    const statsWithOther = {
      window: 30 as const,
      stats: [
        {
          actor_id: 'user-mod-1',
          total: 11,
          counts: { remove: 2 as const, approve: 1 as const, warn: 5, lock: 2, pin: 1 },
        },
      ],
      users: {},
    }
    render(
      <CommunityModeratorStatsPanel
        communitySlug='credit-cards'
        initialData={statsWithOther}
      />,
    )
    // displayed types: remove=2, approve=1, ban=0, resolve_report=0 → sum=3; other=11-3=8
    const cells = screen.getAllByRole('cell')
    const cellTexts = cells.map(c => c.textContent)
    expect(screen.getByTestId('moderator-stats-table')).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('moderator-stats-table')).toHaveAccessibleName(
      'Moderator Contributions',
    )
    // other column is second-to-last; total is last
    expect(cellTexts.at(-1)).toBe('11')
    expect(cellTexts.at(-2)).toBe('8')
  })
})
