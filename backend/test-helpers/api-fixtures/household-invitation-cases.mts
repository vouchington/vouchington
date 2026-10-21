import { encodeCursor } from '@modules/pagination'
import type { ApiFixtureCase } from './types.mts'

const householdId = '00000000-0000-7000-8000-000000000101'
const ownerId = '00000000-0000-7000-8000-000000000001'
const inviteeId = '00000000-0000-7000-8000-000000000003'
const invitationId = '00000000-0000-7000-8000-000000000401'
const membershipId = '00000000-0000-7000-8000-000000000201'
const invitation = {
  id: invitationId,
  household_id: householdId,
  invited_user_id: inviteeId,
  invited_by_id: ownerId,
  relationship: 'partner',
  accepted_at: null,
  declined_at: null,
  revoked_at: null,
  created_at: '2026-07-02T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
}
const invitationPage = {
  results: [invitation],
  page_info: {
    has_next_page: false,
    start_cursor: encodeCursor({ id: invitationId }),
    end_cursor: null,
  },
}
const membership = {
  id: membershipId,
  household_id: householdId,
  relationship: 'partner',
  updated_at: '2026-07-02T00:00:00Z',
  individual: {
    id: '00000000-0000-7000-8000-000000000301',
    user_id: inviteeId,
    username: 'household-invitee',
    updated_at: '2026-07-02T00:00:00Z',
  },
}
const consumers = ['web'] as const
const migratedFrom = ['docs/requirements/users/USER_SETTINGS.md']

export const householdInvitationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.household-invitations.sent',
    method: 'GET',
    path: `/api/v1/households/${householdId}/invitations`,
    route: { routeTemplate: '/api/v1/households/:id/invitations', pathParams: { id: householdId } },
    auth: 'fixture-user',
    status: 200,
    body: invitationPage,
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'web.household-invitations.received',
    method: 'GET',
    path: '/api/v1/my/household-invitations',
    route: { routeTemplate: '/api/v1/my/household-invitations' },
    auth: 'fixture-user',
    status: 200,
    body: invitationPage,
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'web.household-invitations.create',
    method: 'POST',
    path: `/api/v1/households/${householdId}/invitations`,
    route: { routeTemplate: '/api/v1/households/:id/invitations', pathParams: { id: householdId } },
    requestBody: { user: 'household-invitee', relationship: 'partner' },
    auth: 'fixture-user',
    status: 201,
    body: { invitation },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'web.household-invitations.revoke',
    method: 'DELETE',
    path: `/api/v1/households/${householdId}/invitations/${invitationId}`,
    route: {
      routeTemplate: '/api/v1/households/:id/invitations/:invitationId',
      pathParams: { id: householdId, invitationId },
    },
    auth: 'fixture-user',
    status: 204,
    body: null,
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'web.household-invitations.accept',
    method: 'POST',
    path: `/api/v1/my/household-invitations/${invitationId}/acceptance`,
    route: {
      routeTemplate: '/api/v1/my/household-invitations/:invitationId/acceptance',
      pathParams: { invitationId },
    },
    requestBody: {},
    auth: 'fixture-user',
    status: 200,
    body: { membership },
    consumers: [...consumers],
    migratedFrom,
  },
  {
    id: 'web.household-invitations.decline',
    method: 'POST',
    path: `/api/v1/my/household-invitations/${invitationId}/decline`,
    route: {
      routeTemplate: '/api/v1/my/household-invitations/:invitationId/decline',
      pathParams: { invitationId },
    },
    requestBody: {},
    auth: 'fixture-user',
    status: 204,
    body: null,
    consumers: [...consumers],
    migratedFrom,
  },
]
