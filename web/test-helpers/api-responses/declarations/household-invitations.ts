import sent from '../../../../api-fixtures/v1/responses/web.household-invitations.sent.json'
import received from '../../../../api-fixtures/v1/responses/web.household-invitations.received.json'
import created from '../../../../api-fixtures/v1/responses/web.household-invitations.create.json'
import revoked from '../../../../api-fixtures/v1/responses/web.household-invitations.revoke.json'
import accepted from '../../../../api-fixtures/v1/responses/web.household-invitations.accept.json'
import declined from '../../../../api-fixtures/v1/responses/web.household-invitations.decline.json'
import type { ListResponse } from '@/types/api-responses'
import type { HouseholdInvitation } from '@/types/household-invitations'
import type {
  HouseholdInvitationResponse,
  HouseholdInvitationAcceptanceResponse,
} from '@/lib/api/client/household-invitations'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const householdId = '00000000-0000-7000-8000-000000000101'
const invitationId = '00000000-0000-7000-8000-000000000401'

export const HOUSEHOLD_INVITATIONS_DECLARATIONS = [
  defineWebApiFixture<ListResponse<HouseholdInvitation>>()(
    'web.household-invitations.sent',
    sent,
    context => context.client.householdInvitations.getHouseholdInvitationsClient(householdId),
    [context => context.server.householdInvitations.getHouseholdInvitations(householdId)],
  ),
  defineWebApiFixture<ListResponse<HouseholdInvitation>>()(
    'web.household-invitations.received',
    received,
    context => context.client.householdInvitations.getMyHouseholdInvitationsClient(),
    [context => context.server.householdInvitations.getMyHouseholdInvitations()],
  ),
  defineWebApiFixture<HouseholdInvitationResponse>()(
    'web.household-invitations.create',
    created,
    context =>
      context.client.householdInvitations.createHouseholdInvitation(householdId, {
        user: 'household-invitee',
        relationship: 'partner',
      }),
  ),
  defineWebApiFixture<null>()('web.household-invitations.revoke', revoked, context =>
    context.client.householdInvitations.revokeHouseholdInvitation(householdId, invitationId),
  ),
  defineWebApiFixture<HouseholdInvitationAcceptanceResponse>()(
    'web.household-invitations.accept',
    accepted,
    context => context.client.householdInvitations.acceptHouseholdInvitation(invitationId),
  ),
  defineWebApiFixture<null>()('web.household-invitations.decline', declined, context =>
    context.client.householdInvitations.declineHouseholdInvitation(invitationId),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
