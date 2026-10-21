import { createPaginationParser } from '@modules/pagination'
import { validateUUID } from '@modules/utils/ids'
import { getPaginationLimitsForContract } from '@services/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import type { PrivateUser } from '@services/users/types'
import {
  createHouseholdInvitation,
  listHouseholdInvitations,
  listMyHouseholdInvitations,
  revokeHouseholdInvitation,
} from './invitations.mts'
import { decideHouseholdInvitation } from './decision.mts'

type Path = { id?: string; invitationId?: string }
type Query = Record<string, unknown>
type Validate = (input: { path?: Path; query?: Query; body?: unknown }) => void

export const householdInvitationsPaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

function parsePage(input: Query) {
  const parsed = householdInvitationsPaginationParser.parse(
    input,
    getPaginationLimitsForContract(householdInvitationsPaginationParser.queryContract),
  )
  const query = prepareQueryForValidation(input, householdInvitationsPaginationParser.queryContract)
  if (input.limit !== undefined) query.limit = parsed.limit
  if (parsed.after !== undefined) query.after = parsed.after
  return { parsed, query }
}

export async function listMyHouseholdInvitationsCommand(
  currentUser: PrivateUser,
  queryInput: Query,
  validate: Validate,
) {
  const { parsed, query } = parsePage(queryInput)
  validate({ query })
  return listMyHouseholdInvitations(currentUser, parsed)
}

export async function listHouseholdInvitationsCommand(
  currentUser: PrivateUser,
  path: Path,
  queryInput: Query,
  validate: Validate,
) {
  validateUUID(path.id!)
  const { parsed, query } = parsePage(queryInput)
  validate({ path, query })
  return listHouseholdInvitations(currentUser, path.id!, parsed)
}

export async function createHouseholdInvitationCommand(
  currentUser: PrivateUser,
  path: Path,
  readBody: () => Promise<{ user: string; relationship?: string }>,
  validate: Validate,
) {
  validateUUID(path.id!)
  const body = await readBody()
  validate({ path, body })
  return createHouseholdInvitation(currentUser, path.id!, body)
}

export async function revokeHouseholdInvitationCommand(
  currentUser: PrivateUser,
  path: Path,
  validate: Validate,
) {
  validateUUID(path.id!)
  validateUUID(path.invitationId!)
  validate({ path })
  await revokeHouseholdInvitation(currentUser, path.id!, path.invitationId!)
}

export async function decideHouseholdInvitationCommand(
  currentUser: PrivateUser,
  path: Path,
  decision: 'accept' | 'decline',
  readBody: () => Promise<Record<string, never>>,
  validate: Validate,
) {
  validateUUID(path.invitationId!)
  const body = await readBody()
  validate({ path, body })
  return decideHouseholdInvitation(currentUser, path.invitationId!, decision)
}
