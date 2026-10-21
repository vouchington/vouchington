import { defineQueryContract, queryEnum } from '@vouchington/pagination'
import { createPaginationParser } from '@modules/pagination'
import { getPaginationLimitsForContract } from '@services/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { validateUUID } from '@modules/utils/ids'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { getOrCreateIndividual } from '../individuals/individuals.mts'
import { getHouseholdsByUser, getHouseholdMemberships } from './household-lists.mts'
import {
  getHousehold,
  createHousehold,
  deleteHousehold,
  addHouseholdMembership,
  removeHouseholdMembership,
} from './households.mts'

type HouseholdPath = { id?: string; membershipId?: string }
type HouseholdQuery = Record<string, unknown>
type Validate = (input: { path?: HouseholdPath; query?: HouseholdQuery; body?: unknown }) => void

export const householdsPaginationParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 25 },
})
export const householdsFilterQuery = defineQueryContract({
  access: queryEnum(['all', 'owned', 'member'] as const),
})
export const householdMembershipsPaginationParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 25 },
})

function paginatedQuery(
  input: HouseholdQuery,
  parser: typeof householdsPaginationParser,
  extra: Record<string, unknown> = {},
) {
  const parsed = parser.parse(input, getPaginationLimitsForContract(parser.queryContract))
  const query = prepareQueryForValidation(input, { ...parser.queryContract, ...extra })
  if (input.limit !== undefined) query.limit = parsed.limit
  if (parsed.after !== undefined) query.after = parsed.after
  return { parsed, query }
}

export async function listMyHouseholds(
  currentUser: PrivateUser,
  queryInput: HouseholdQuery,
  validate: Validate,
) {
  const { parsed, query } = paginatedQuery(
    queryInput,
    householdsPaginationParser,
    householdsFilterQuery.queryContract,
  )
  validate({ query })
  const access = (queryInput.access ?? 'all') as 'all' | 'owned' | 'member'
  return getHouseholdsByUser(currentUser, { access, ...parsed })
}

export async function readMyHousehold(
  currentUser: PrivateUser,
  path: HouseholdPath,
  validate: Validate,
) {
  validateUUID(path.id!)
  validate({ path })
  return { household: await getHousehold(currentUser, path.id!) }
}

export async function listMyHouseholdMemberships(
  currentUser: PrivateUser,
  path: HouseholdPath,
  queryInput: HouseholdQuery,
  validate: Validate,
) {
  validateUUID(path.id!)
  const { parsed, query } = paginatedQuery(queryInput, householdMembershipsPaginationParser)
  validate({ path, query })
  return getHouseholdMemberships(currentUser, path.id!, parsed)
}

export async function readMyIndividual(currentUser: PrivateUser, validate: Validate) {
  validate({})
  return { individual: await getOrCreateIndividual(currentUser) }
}

export async function createMyHousehold(
  currentUser: PrivateUser,
  readBody: () => Promise<Record<string, never>>,
  validate: Validate,
) {
  assertNotSuspended(currentUser)
  const body = await readBody()
  validate({ body })
  return { household: await createHousehold(currentUser) }
}

export async function deleteMyHousehold(
  currentUser: PrivateUser,
  path: HouseholdPath,
  validate: Validate,
) {
  assertNotSuspended(currentUser)
  validateUUID(path.id!)
  validate({ path })
  await deleteHousehold(currentUser, path.id!)
  return { success: true }
}

export async function addMyHouseholdMembership(
  currentUser: PrivateUser,
  path: HouseholdPath,
  readBody: () => Promise<{ individual_id: string; relationship?: string }>,
  validate: Validate,
) {
  assertNotSuspended(currentUser)
  validateUUID(path.id!)
  const body = await readBody()
  validate({ path, body })
  return {
    membership: await addHouseholdMembership(
      currentUser,
      path.id!,
      body.individual_id,
      body.relationship,
    ),
  }
}

export async function removeMyHouseholdMembership(
  currentUser: PrivateUser,
  path: HouseholdPath,
  validate: Validate,
) {
  assertNotSuspended(currentUser)
  validateUUID(path.id!)
  validateUUID(path.membershipId!)
  validate({ path })
  await removeHouseholdMembership(currentUser, path.id!, path.membershipId!)
  return { success: true }
}
