import type { HouseholdMembership as Membership, HouseholdSection } from '@/types/my'

export function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 'membership-1',
    household_id: 'household-1',
    relationship: 'spouse',
    individual: {
      id: '00000000-0000-7000-8000-000000000001',
      user_id: 'user-2',
      username: 'alice',
      updated_at: '2026-07-01T00:00:00Z',
    },
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

export function makeSection(overrides: Partial<HouseholdSection> = {}): HouseholdSection {
  return {
    household: { id: 'household-1', owner_id: 'user-1', updated_at: '2026-07-01T00:00:00Z' },
    isOwner: true,
    memberships: [makeMembership()],
    membershipPageInfo: {
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    },
    membershipLoadError: false,
    ...overrides,
  }
}

export function deferred<T>() {
  return Promise.withResolvers<T>()
}

export function allByPw(value: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-pw="${value}"]`)]
}
