import type { ApiFixtureCase } from './types.mts'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'

const consumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const
const fixtureUserId = '00000000-0000-7000-8000-000000000001'
const householdId = '00000000-0000-7000-8000-000000000101'
const householdScope = (access: string) =>
  `households:${fixtureUserId}:access=${access}:updated_at-desc,id-desc`
const membershipScope = `household-memberships:${householdId}:updated_at-desc,id-desc`
const migratedFrom = [
  'docs/requirements/users/USER_SETTINGS.md',
  'web/components/my/household-manager.tsx',
]

export type HouseholdFixture = {
  id: string
  owner_id: string
  updated_at: string
}

export type MembershipFixture = {
  id: string
  household_id: string
  relationship: string | null
  updated_at: string
  individual: {
    id: string
    user_id: string | null
    username: string | null
    updated_at: string
  }
}

const ownedHousehold: HouseholdFixture = {
  id: householdId,
  owner_id: fixtureUserId,
  updated_at: '2026-07-02T00:00:00Z',
}
const sharedHousehold: HouseholdFixture = {
  id: '00000000-0000-7000-8000-000000000102',
  owner_id: '00000000-0000-7000-8000-000000000002',
  updated_at: '2026-07-01T00:00:00Z',
}
const secondSharedHousehold: HouseholdFixture = {
  id: '00000000-0000-7000-8000-000000000103',
  owner_id: '00000000-0000-7000-8000-000000000004',
  updated_at: '2026-06-30T00:00:00Z',
}
const membership: MembershipFixture = {
  id: '00000000-0000-7000-8000-000000000201',
  household_id: householdId,
  relationship: 'spouse',
  updated_at: '2026-07-02T00:00:00Z',
  individual: {
    id: '00000000-0000-7000-8000-000000000301',
    user_id: '00000000-0000-7000-8000-000000000003',
    username: 'household-alice',
    updated_at: '2026-07-02T00:00:00Z',
  },
}

export const nativeHouseholdPaginationApiFixtureCases: ApiFixtureCase[] = [
  householdListCase('native.households.owned', 'owned', undefined, [ownedHousehold], false),
  householdListCase(
    'native.households.member.default',
    'member',
    undefined,
    [sharedHousehold],
    true,
  ),
  householdListCase(
    'native.households.member.page-2',
    'member',
    householdCursor(sharedHousehold, 'member'),
    [secondSharedHousehold],
    false,
  ),
  membershipListCase('native.household-memberships.page-1', undefined, [membership], true),
  membershipListCase(
    'native.household-memberships.page-2',
    membershipCursor(membership),
    [
      {
        ...membership,
        id: '00000000-0000-7000-8000-000000000202',
        relationship: 'parent',
        updated_at: '2026-07-01T00:00:00Z',
        individual: {
          ...membership.individual,
          id: '00000000-0000-7000-8000-000000000302',
          user_id: null,
          username: null,
          updated_at: '2026-07-01T00:00:00Z',
        },
      },
    ],
    false,
  ),
]

function householdListCase(
  id: string,
  access: 'owned' | 'member',
  after: string | undefined,
  results: HouseholdFixture[],
  hasNextPage: boolean,
): ApiFixtureCase {
  return {
    id,
    method: 'GET',
    path: '/api/v1/households',
    route: { routeTemplate: '/api/v1/households' },
    query: { access, limit: '1', ...(after ? { after } : {}) },
    auth: 'fixture-user',
    status: 200,
    body: {
      results,
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: householdCursor(results[0]!, access),
        end_cursor: hasNextPage ? householdCursor(results.at(-1)!, access) : null,
      },
    },
    consumers: [...consumers],
    migratedFrom,
  }
}

function membershipListCase(
  id: string,
  after: string | undefined,
  results: MembershipFixture[],
  hasNextPage: boolean,
): ApiFixtureCase {
  return {
    id,
    method: 'GET',
    path: `/api/v1/households/${householdId}/memberships`,
    route: {
      routeTemplate: '/api/v1/households/:id/memberships',
      pathParams: { id: householdId },
    },
    query: { limit: '1', ...(after ? { after } : {}) },
    auth: 'fixture-user',
    status: 200,
    body: {
      results,
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: membershipCursor(results[0]!),
        end_cursor: hasNextPage ? membershipCursor(results.at(-1)!) : null,
      },
    },
    consumers: [...consumers],
    migratedFrom,
  }
}

function householdCursor(household: HouseholdFixture, access: string): string {
  return encodeScopedPreciseTimestampCursor(
    preciseTimestamp(household.updated_at),
    household.id,
    householdScope(access),
  )
}

function membershipCursor(item: MembershipFixture): string {
  return encodeScopedPreciseTimestampCursor(
    preciseTimestamp(item.updated_at),
    item.id,
    membershipScope,
  )
}

export function terminalPageInfo(item: { id: string; updated_at: string }, scope: string) {
  return {
    has_next_page: false,
    start_cursor: encodeScopedPreciseTimestampCursor(
      preciseTimestamp(item.updated_at),
      item.id,
      scope,
    ),
    end_cursor: null,
  }
}

function preciseTimestamp(timestamp: string): string {
  return timestamp.replace('Z', '.000000Z')
}
