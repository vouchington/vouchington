import { describe, expect, it } from 'vitest'
import type { CommunityRestriction, CommunityRestrictionsResponseBody } from '@/types/api-responses'
import {
  formatRestrictionExpiry,
  formatRestrictionType,
  getActiveRestrictions,
  getExpiresAt,
  initialRaidModeState,
  raidModeReducer,
} from '../community-raid-mode-state'

describe('community raid mode state', () => {
  it('updates selected restrictions and form fields', () => {
    const withLinks = raidModeReducer(initialRaidModeState, {
      type: 'toggleRestriction',
      restrictionType: 'no_links',
      checked: true,
    })

    expect(withLinks.selectedTypes.has('no_links')).toBe(true)

    const withoutLinks = raidModeReducer(withLinks, {
      type: 'toggleRestriction',
      restrictionType: 'no_links',
      checked: false,
    })
    const manual = raidModeReducer(withoutLinks, { type: 'setDuration', duration: 'manual' })
    const withReason = raidModeReducer(manual, { type: 'setReason', reason: 'vote spike' })
    const saving = raidModeReducer(withReason, { type: 'saving' })
    const lifting = raidModeReducer(saving, { type: 'lifting', liftingId: 'restriction-1' })
    const reset = raidModeReducer(lifting, { type: 'resetBusy' })

    expect(withoutLinks.selectedTypes.has('no_links')).toBe(false)
    expect(withReason).toMatchObject({ duration: 'manual', reason: 'vote spike' })
    expect(lifting).toMatchObject({ isSaving: true, liftingId: 'restriction-1' })
    expect(reset).toMatchObject({ isSaving: false, liftingId: null })
  })

  it('formats restriction labels and expiries', () => {
    expect(formatRestrictionType('require_post_approval')).toBe('Require post approval')
    expect(formatRestrictionType('no_new_member_posts')).toBe('Block new member posts')
    expect(formatRestrictionType('no_links')).toBe('Block links')
    expect(formatRestrictionType('approved_members_only')).toBe('Approved members only')
    expect(formatRestrictionExpiry(null)).toBe('Manual lift')
    expect(formatRestrictionExpiry('2026-01-02T03:04:05.000Z')).toBe('Expires 2026-01-02 03:04 UTC')
  })

  it('computes expiry and filters inactive restrictions', () => {
    const expiresAt = getExpiresAt('1h')

    expect(expiresAt).toEqual(expect.any(String))
    expect(getExpiresAt('manual')).toBeNull()
    expect(getActiveRestrictions(makeRestrictionData())).toHaveLength(1)
  })
})

function makeRestrictionData(): CommunityRestrictionsResponseBody {
  const activeExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  return {
    results: [
      { __entity_type: 'community_restriction', id: 'active' },
      { __entity_type: 'community_restriction', id: 'lifted' },
      { __entity_type: 'community_restriction', id: 'expired' },
      { __entity_type: 'community_restriction', id: 'missing' },
    ],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    raid_mode_suggestion: { velocity_spike: false, flag_count: 0, latest_flagged_at: null },
    community_restrictions: {
      active: makeRestriction({ id: 'active', expires_at: activeExpiresAt }),
      lifted: makeRestriction({ id: 'lifted', lifted_at: '2026-01-01T00:00:00.000Z' }),
      expired: makeRestriction({ id: 'expired', expires_at: expiredAt }),
    },
  }
}

function makeRestriction(overrides: Partial<CommunityRestriction> = {}): CommunityRestriction {
  return {
    __entity_type: 'community_restriction' as const,
    id: 'restriction-1',
    community_id: 'community-1',
    restriction_type: 'no_links' as const,
    activated_by_id: 'owner-1',
    activated_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    lifted_at: null,
    lifted_by_id: null,
    reason: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
