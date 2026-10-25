import type { ToolOutputSchema } from '@services/openai-agents/tool-types'
import type { PrivateUser } from '@services/users/types'
import {
  createHouseholdInvitationCommand,
  decideHouseholdInvitationCommand,
  listHouseholdInvitationsCommand,
  listMyHouseholdInvitationsCommand,
  revokeHouseholdInvitationCommand,
} from '@services/individuals-households/household-invitations/commands'
import { successSchema } from '@vouchington/mcp-server/schema'
import {
  pageProperties,
  page,
  path,
  source,
  uuid,
  validated,
  type HouseholdArgs,
  type PageArgs,
} from './my-household-tool.mts'

const root = '/api/v1/households'
type InvitationArgs = HouseholdArgs & { invitation_id: string }
type InviteArgs = HouseholdArgs & { user: string; relationship?: string }
type DecisionArgs = { invitation_id: string }

function invitationWrite<TArgs>(
  description: string,
  endpoint: { method: 'POST'; path: string },
  properties: Record<string, unknown>,
  required: string[],
  execute: (currentUser: PrivateUser, args: TArgs) => Promise<unknown>,
  outputSchema?: ToolOutputSchema,
) {
  return source<TArgs>(description, endpoint, properties, required, execute, true, outputSchema)
}

const declineSource = invitationWrite<DecisionArgs>(
  'Decline a pending household invitation addressed to you.',
  { method: 'POST', path: '/api/v1/my/household-invitations/:invitationId/decline' },
  { invitation_id: uuid },
  ['invitation_id'],
  (user, args) =>
    decideHouseholdInvitationCommand(
      user,
      { invitationId: args.invitation_id },
      'decline',
      async () => ({}),
      validated,
    ).then(() => ({ success: true })),
  successSchema({}),
)

export const readHouseholdInvitationsGroup = {
  name: 'read_my_households',
  options: [
    {
      option: 'invitations',
      source: source<HouseholdArgs & PageArgs>(
        'List pending invitations for a household you own or administer.',
        { method: 'GET', path: `${root}/:id/invitations` },
        { household_id: uuid, ...pageProperties },
        ['household_id'],
        (user, args) => listHouseholdInvitationsCommand(user, path(args), page(args), validated),
      ),
    },
    {
      option: 'my_invitations',
      source: source<PageArgs>(
        'List household invitations addressed to you.',
        { method: 'GET', path: '/api/v1/my/household-invitations' },
        { ...pageProperties },
        [],
        (user, args) => listMyHouseholdInvitationsCommand(user, page(args), validated),
      ),
    },
  ],
} as const

export const manageHouseholdInvitationsGroup = {
  name: 'manage_my_households',
  options: [
    {
      option: 'invite',
      source: invitationWrite<InviteArgs>(
        'Invite an existing user to a household you own or administer using their user ID or username.',
        { method: 'POST', path: `${root}/:id/invitations` },
        {
          household_id: uuid,
          user: { type: 'string', minLength: 1 },
          relationship: { type: 'string', maxLength: 64 },
        },
        ['household_id', 'user'],
        async (user, args) => {
          const result = await createHouseholdInvitationCommand(
            user,
            path(args),
            async () => ({ user: args.user, relationship: args.relationship }),
            validated,
          )
          return { invitation: result.invitation }
        },
      ),
    },
    {
      option: 'revoke_invitation',
      source: source<InvitationArgs>(
        'Revoke a pending invitation from a household you own or administer.',
        { method: 'DELETE', path: `${root}/:id/invitations/:invitationId` },
        { household_id: uuid, invitation_id: uuid },
        ['household_id', 'invitation_id'],
        async (user, args) => {
          await revokeHouseholdInvitationCommand(
            user,
            { ...path(args), invitationId: args.invitation_id },
            validated,
          )
          return { success: true }
        },
        true,
      ),
    },
    {
      option: 'accept_invitation',
      source: invitationWrite<DecisionArgs>(
        'Accept a pending household invitation addressed to you.',
        { method: 'POST', path: '/api/v1/my/household-invitations/:invitationId/acceptance' },
        { invitation_id: uuid },
        ['invitation_id'],
        (user, args) =>
          decideHouseholdInvitationCommand(
            user,
            { invitationId: args.invitation_id },
            'accept',
            async () => ({}),
            validated,
          ),
      ),
    },
    {
      option: 'decline_invitation',
      source: declineSource,
    },
  ],
} as const
