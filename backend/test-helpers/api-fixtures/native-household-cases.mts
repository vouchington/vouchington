import type { ApiFixtureCase } from './types.mts'
import {
  terminalPageInfo,
  type HouseholdFixture,
  type MembershipFixture,
} from './native-household-pagination-cases.mts'

const consumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const
const householdId = '00000000-0000-7000-8000-000000000101'
const sharedHouseholdId = '00000000-0000-7000-8000-000000000102'
const fixtureUserId = '00000000-0000-7000-8000-000000000001'
const householdScope = (access: string) =>
  `households:${fixtureUserId}:access=${access}:updated_at-desc,id-desc`
const membershipScope = `household-memberships:${householdId}:updated_at-desc,id-desc`
const emptyPageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }
const migratedFrom = [
  'docs/requirements/users/USER_SETTINGS.md',
  'web/components/my/household-manager.tsx',
]

const ownedHousehold: HouseholdFixture = {
  id: householdId,
  owner_id: '00000000-0000-7000-8000-000000000001',
  updated_at: '2026-07-02T00:00:00Z',
}
const sharedHousehold: HouseholdFixture = {
  id: sharedHouseholdId,
  owner_id: '00000000-0000-7000-8000-000000000002',
  updated_at: '2026-07-01T00:00:00Z',
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

export const nativeHouseholdApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.households.empty',
    method: 'GET',
    path: '/api/v1/households',
    route: { routeTemplate: '/api/v1/households' },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: emptyPageInfo },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.households.single-owned',
    method: 'GET',
    path: '/api/v1/households',
    route: { routeTemplate: '/api/v1/households' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [ownedHousehold],
      page_info: terminalPageInfo(ownedHousehold, householdScope('all')),
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.households.multiple',
    method: 'GET',
    path: '/api/v1/households',
    route: { routeTemplate: '/api/v1/households' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [ownedHousehold, sharedHousehold],
      page_info: terminalPageInfo(ownedHousehold, householdScope('all')),
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.household-memberships.empty',
    method: 'GET',
    path: `/api/v1/households/${householdId}/memberships`,
    route: {
      routeTemplate: '/api/v1/households/:id/memberships',
      pathParams: { id: householdId },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: emptyPageInfo },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.household-memberships.single',
    method: 'GET',
    path: `/api/v1/households/${householdId}/memberships`,
    route: {
      routeTemplate: '/api/v1/households/:id/memberships',
      pathParams: { id: householdId },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [membership],
      page_info: terminalPageInfo(membership, membershipScope),
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.household-memberships.multiple',
    method: 'GET',
    path: `/api/v1/households/${householdId}/memberships`,
    route: {
      routeTemplate: '/api/v1/households/:id/memberships',
      pathParams: { id: householdId },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        membership,
        {
          id: '00000000-0000-7000-8000-000000000202',
          household_id: householdId,
          relationship: ' ',
          updated_at: '2026-07-01T00:00:00Z',
          individual: {
            id: '00000000-0000-7000-8000-000000000302',
            user_id: null,
            username: null,
            updated_at: '2026-07-01T00:00:00Z',
          },
        },
        {
          id: '00000000-0000-7000-8000-000000000203',
          household_id: householdId,
          relationship: null,
          updated_at: '2026-06-30T00:00:00Z',
          individual: {
            id: '00000000-0000-7000-8000-000000000303',
            user_id: null,
            username: null,
            updated_at: '2026-06-30T00:00:00Z',
          },
        },
      ],
      page_info: terminalPageInfo(membership, membershipScope),
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.households.create.default',
    method: 'POST',
    path: '/api/v1/households',
    route: { routeTemplate: '/api/v1/households' },
    requestBody: {},
    auth: 'fixture-user',
    status: 201,
    body: {
      household: { ...ownedHousehold, created_at: '2026-07-02T00:00:00Z' },
    },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'native.household-memberships.delete.default',
    method: 'DELETE',
    path: `/api/v1/households/${householdId}/memberships/${membership.id}`,
    route: {
      routeTemplate: '/api/v1/households/:id/memberships/:membershipId',
      pathParams: { id: householdId, membershipId: membership.id },
    },
    auth: 'fixture-user',
    status: 204,
    body: null,
    consumers: [...consumers],
    migratedFrom,
  },
]
