import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityBan, CommunityBansResponseBody } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses/communities'

// Components use data-pw (not data-testid) per project conventions.
configure({ testIdAttribute: 'data-pw' })

const { mockLiftBan, mockFetchCommunityBans, mockRefresh } = vi.hoisted(() => ({
  mockLiftBan: vi.fn<VitestLooseMock>(),
  mockFetchCommunityBans: vi.fn<VitestLooseMock>(),
  mockRefresh: vi.fn<() => void>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  liftBan: mockLiftBan,
  fetchCommunityBans: mockFetchCommunityBans,
}))

import { CommunityBansPanel } from '../community-bans-panel'

function makeBan(overrides: Partial<CommunityBan> = {}): CommunityBan {
  return {
    __entity_type: 'community_ban',
    id: 'ban-1',
    community_id: 'c-1',
    user_id: 'u-1',
    banned_by_id: 'owner-1',
    case_id: '00000000-0000-0000-0000-000000000001',
    reason: 'spam',
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    lifted_at: null,
    lifted_by_id: null,
    ...overrides,
  }
}

function makeData(bans: CommunityBan[], hasNext = false): CommunityBansResponseBody {
  return {
    results: bans.map(b => ({ __entity_type: 'community_ban' as const, id: b.id })),
    page_info: {
      has_next_page: hasNext,
      end_cursor: hasNext ? 'cursor' : null,
      start_cursor: null,
    },
    community_bans: Object.fromEntries(bans.map(b => [b.id, b])),
    users: { 'u-1': { id: 'u-1', username: 'spammer' } as never },
  }
}

describe('CommunityBansPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the empty state when there are no bans', () => {
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([])}
      />,
    )
    expect(screen.getByTestId('community-bans-empty')).toBeInTheDocument()
  })

  it('renders an active ban with username, reason, and lift button', () => {
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan()])}
      />,
    )
    expect(screen.getByText('@spammer')).toBeInTheDocument()
    expect(screen.getByText('Reason: spam')).toBeInTheDocument()
    expect(screen.getByTestId('community-ban-lift')).toBeInTheDocument()
  })

  it('lifts a ban and refreshes', async () => {
    mockLiftBan.mockResolvedValueOnce(undefined)
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan()])}
      />,
    )

    fireEvent.click(screen.getByTestId('community-ban-lift'))

    await waitFor(() => expect(mockLiftBan).toHaveBeenCalledWith('test-community', 'u-1'))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(screen.getByText('Lifted')).toBeVisible()
    expect(screen.getByText(/^Lifted: /).textContent).toMatch(/^Lifted: \d{4}-\d{2}-\d{2}$/)
  })

  it('shows an error when lift fails', async () => {
    mockLiftBan.mockRejectedValueOnce(new Error('nope'))
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan()])}
      />,
    )

    fireEvent.click(screen.getByTestId('community-ban-lift'))

    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument())
  })

  it('does not render a lift button for an already-lifted ban', () => {
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan({ lifted_at: '2026-02-01T00:00:00.000Z' })])}
      />,
    )
    expect(screen.queryByTestId('community-ban-lift')).not.toBeInTheDocument()
    expect(screen.getByText('Lifted')).toBeInTheDocument()
  })

  it('labels a naturally-expired ban as Expired (not lifted) with no lift button', () => {
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan({ expires_at: '2000-01-01T00:00:00.000Z' })])}
      />,
    )
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.queryByTestId('community-ban-lift')).not.toBeInTheDocument()
  })

  it('loads more bans when paginated', async () => {
    mockFetchCommunityBans.mockResolvedValueOnce(
      makeData([makeBan({ id: 'ban-2', user_id: 'u-2' })]),
    )
    render(
      <CommunityBansPanel
        community={makeCommunity()}
        initialData={makeData([makeBan()], true)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() =>
      expect(mockFetchCommunityBans).toHaveBeenCalledWith('test-community', 'cursor'),
    )
  })
})
