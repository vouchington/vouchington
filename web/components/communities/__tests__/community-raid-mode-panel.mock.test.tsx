import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityRestriction, CommunityRestrictionsResponseBody } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses/communities'

const { mockActivate, mockLift, mockRefresh, mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockActivate: vi.fn<VitestLooseMock>(),
  mockLift: vi.fn<VitestLooseMock>(),
  mockRefresh: vi.fn<() => void>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/community-restrictions'), () => ({
  activateCommunityRestrictions: mockActivate,
  liftCommunityRestriction: mockLift,
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

  it('renders the default activation form when there is no spike', () => {
    render(
      <CommunityRaidModePanel
        community={makeCommunity()}
        initialData={makeData([])}
      />,
    )

    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument()
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
