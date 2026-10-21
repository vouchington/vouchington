import {
  createMyHousehold,
  deleteMyHousehold,
  addMyHouseholdMembership,
  removeMyHouseholdMembership,
} from '@services/individuals-households/households/household-commands'
import { source, path, uuid, validated, type HouseholdArgs } from './my-household-tool.mts'
import { manageHouseholdInvitationsGroup } from './my-household-invitations.mts'

const root = '/api/v1/households'
type MembershipArgs = HouseholdArgs & { individual_id: string; relationship?: string }
type RemoveArgs = HouseholdArgs & { membership_id: string }

export const manageMyHouseholdsGroup = {
  name: 'manage_my_households',
  options: [
    {
      option: 'create',
      source: source<Record<string, never>>(
        'Create a household that you own.',
        { method: 'POST', path: root },
        {},
        [],
        user => createMyHousehold(user, async () => ({}), validated),
        true,
      ),
    },
    {
      option: 'delete',
      source: source<HouseholdArgs>(
        'Delete your household by household_id. This also deletes its spending entries.',
        { method: 'DELETE', path: `${root}/:id` },
        { household_id: uuid },
        ['household_id'],
        (user, args) => deleteMyHousehold(user, path(args), validated),
        true,
      ),
    },
    {
      option: 'add_member',
      source: source<MembershipArgs>(
        'Add your own individual_id to a household you own. Another user requires an invitation.',
        { method: 'POST', path: `${root}/:id/memberships` },
        {
          household_id: uuid,
          individual_id: uuid,
          relationship: { type: 'string', maxLength: 64 },
        },
        ['household_id', 'individual_id'],
        (user, args) =>
          addMyHouseholdMembership(
            user,
            path(args),
            async () => ({ individual_id: args.individual_id, relationship: args.relationship }),
            validated,
          ),
        true,
      ),
    },
    {
      option: 'remove_member',
      source: source<RemoveArgs>(
        'Remove a household membership by membership_id. Only the household owner can remove members.',
        { method: 'DELETE', path: `${root}/:id/memberships/:membershipId` },
        { household_id: uuid, membership_id: uuid },
        ['household_id', 'membership_id'],
        (user, args) =>
          removeMyHouseholdMembership(
            user,
            { ...path(args), membershipId: args.membership_id },
            validated,
          ),
        true,
      ),
    },
    ...manageHouseholdInvitationsGroup.options,
  ],
} as const
