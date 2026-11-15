import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityRestriction, CommunityRestrictionsResponseBody } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses/communities'

const { mockActivate, mockLift, mockGetRestrictions, mockOnError, mockOnSuccess } = vi.hoisted(
  () => ({
    mockActivate: vi.fn<VitestLooseMock>(),
    mockLift: vi.fn<VitestLooseMock>(),
    mockGetRestrictions: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
    mockOnSuccess: vi.fn<(message: string) => void>(),
  }),
)

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
const mockNav = createNavMock()
const mockRefresh = mockNav.refresh

vi.mock(import('@/lib/api/client/community-restrictions'), () => ({
  activateCommunityRestrictions: mockActivate,
  liftCommunityRestriction: mockLift,
  getCommunityRestrictionPage: mockGetRestrictions,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

import { CommunityRaidModePanel } from '../community-raid-mode-panel'

describe('CommunityRaidModePanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state and activates default restrictions', async () => {
    mockActivate.mockResolvedValueOnce({ community_restrictions: {} })
    render(
      <CommunityRaidModePanel
        community={makeCommunity()}
        initialData={makeData([])}
      />,
    )

    expect(screen.getByText('No active restrictions.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    await waitFor(() => expect(mockActivate).toHaveBeenCalled())
    expect(mockActivate.mock.calls[0]?.[0]).toBe('test-community')
    expect(mockActivate.mock.calls[0]?.[1]).toMatchObject({
      restrictionTypes: ['require_post_approval', 'no_new_member_posts'],
      reason: undefined,
    })
    expect(typeof mockActivate.mock.calls[0]?.[1].expiresAt).toBe('string')
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('renders velocity spike suggestion', () => {
    render(
      <CommunityRaidModePanel
        community={makeCommunity()}
        initialData={makeData([], {
          velocity_spike: true,
          flag_count: 2,
          latest_flagged_at: '2026-01-01T00:00:00.000Z',
        })}
      />,
    )

    expect(screen.getByText('Vote spike detected')).toBeInTheDocument()
    expect(screen.getByText(/2 unresolved velocity spikes/)).toBeInTheDocument()
  })

  it('shows past restrictions separately and continues their page without lift controls', async () => {
    const first = makeData([
      makeRestriction({ id: 'past-1', lifted_at: '2026-01-02T00:00:00.000Z' }),
    ])
    first.page_info = { has_next_page: true, start_cursor: null, end_cursor: 'past-cursor' }
    mockGetRestrictions.mockResolvedValueOnce(first)
    mockGetRestrictions.mockResolvedValueOnce(
      makeData([makeRestriction({ id: 'past-2', lifted_at: '2026-01-02T00:00:00.000Z' })]),
    )
    render(
      <CommunityRaidModePanel
        community={makeCommunity()}
        initialData={makeData([])}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Past' }))
    await screen.findByRole('button', { name: 'Load more' })
    expect(mockGetRestrictions).toHaveBeenLastCalledWith('test-community', {
      status: 'past',
      after: undefined,
    })
    expect(screen.queryByRole('button', { name: 'Lift' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(mockGetRestrictions).toHaveBeenLastCalledWith('test-community', {
        status: 'past',
        after: 'past-cursor',
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument(),
    )
    expect(document.querySelectorAll('[data-pw="community-raid-mode-active-row"]')).toHaveLength(2)
  })

  it('keeps the server-rendered active page when loading its first continuation', async () => {
    const initial = makeData([makeRestriction({ id: 'active-1' })])
    initial.page_info = { has_next_page: true, start_cursor: null, end_cursor: 'active-cursor' }
    mockGetRestrictions.mockResolvedValueOnce(makeData([makeRestriction({ id: 'active-2' })]))
    render(
      <CommunityRaidModePanel
        community={makeCommunity()}
        initialData={initial}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Lift' })).toHaveLength(2))
    expect(mockGetRestrictions).toHaveBeenLastCalledWith('test-community', {
      status: 'active',
      after: 'active-cursor',
    })
  })

  it('lifts an active restriction', async () => {
    mockLift.mockResolvedValueOnce(undefined)
    render(
      <CommunityRaidModePanel
        community={makeCommunity()}
        initialData={makeData([makeRestriction()])}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Lift' }))

    await waitFor(() => expect(mockLift).toHaveBeenCalledWith('test-community', 'restriction-1'))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('refreshes after partial lift-all failures', async () => {
    mockLift.mockResolvedValueOnce(undefined)
    mockLift.mockRejectedValueOnce(new Error('failed'))
    render(
      <CommunityRaidModePanel
        community={makeCommunity()}
        initialData={makeData([
          makeRestriction({ id: 'restriction-1', restriction_type: 'no_links' }),
          makeRestriction({ id: 'restriction-2', restriction_type: 'no_new_member_posts' }),
        ])}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Lift all' }))

    await waitFor(() => expect(mockLift).toHaveBeenCalledTimes(2))
    expect(mockOnError).toHaveBeenCalled()
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })
})

function makeRestriction(overrides: Partial<CommunityRestriction> = {}): CommunityRestriction {
  return {
    __entity_type: 'community_restriction',
    id: 'restriction-1',
    community_id: 'community-1',
    restriction_type: 'no_links',
    activated_by_id: 'owner-1',
    activated_at: '2026-01-01T00:00:00.000Z',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    lifted_at: null,
    lifted_by_id: null,
    reason: 'brigade',
    ...overrides,
  }
}

function makeData(
  restrictions: CommunityRestriction[],
  suggestion: CommunityRestrictionsResponseBody['raid_mode_suggestion'] = {
    velocity_spike: false,
    flag_count: 0,
    latest_flagged_at: null,
  },
): CommunityRestrictionsResponseBody {
  return {
    results: restrictions.map(restriction => ({
      __entity_type: 'community_restriction' as const,
      id: restriction.id,
    })),
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    community_restrictions: Object.fromEntries(
      restrictions.map(restriction => [restriction.id, restriction]),
    ),
    raid_mode_suggestion: suggestion,
  }
}
