import {
  listMyHouseholds,
  readMyHousehold,
  listMyHouseholdMemberships,
  readMyIndividual,
} from '@services/individuals-households/households/household-commands'
import {
  source,
  pageProperties,
  page,
  path,
  uuid,
  validated,
  type PageArgs,
  type HouseholdArgs,
} from './my-household-tool.mts'

const root = '/api/v1/households'

export const readMyHouseholdsGroup = {
  name: 'read_my_households',
  options: [
    {
      option: 'list',
      source: source<PageArgs & { access?: 'all' | 'owned' | 'member' }>(
        'List households you own or belong to. Use access to select all, owned, or member households.',
        { method: 'GET', path: root },
        { access: { type: 'string', enum: ['all', 'owned', 'member'] }, ...pageProperties },
        [],
        (user, args) =>
          listMyHouseholds(
            user,
            { ...page(args), ...(args.access === undefined ? {} : { access: args.access }) },
            validated,
          ),
      ),
    },
    {
      option: 'get',
      source: source<HouseholdArgs>(
        'Read a household by household_id when you own it or belong to it.',
        { method: 'GET', path: `${root}/:id` },
        { household_id: uuid },
        ['household_id'],
        (user, args) => readMyHousehold(user, path(args), validated),
      ),
    },
    {
      option: 'memberships',
      source: source<HouseholdArgs>(
        'List members of a household you own or belong to.',
        { method: 'GET', path: `${root}/:id/memberships` },
        { household_id: uuid, ...pageProperties },
        ['household_id'],
        (user, args) => listMyHouseholdMemberships(user, path(args), page(args), validated),
      ),
    },
    {
      option: 'my_individual',
      source: source<Record<string, never>>(
        'Read your individual_id for adding yourself to a household.',
        { method: 'GET', path: '/api/v1/me/individual' },
        {},
        [],
        user => readMyIndividual(user, validated),
      ),
    },
  ],
} as const
