import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { recordModeratorAction } from '@services/moderator-actions'
import { currentUserCanModerateCommunity } from '../authorization.mts'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import type { CommunityRestriction, CommunityRestrictionType } from '../types.mts'
import { COMMUNITY_RESTRICTION_TYPES } from './types.mts'

export type ActivateCommunityRestrictionsInput = {
  restrictionTypes: CommunityRestrictionType[]
  expiresAt: Date | null
  reason?: string | null
}

export async function activateCommunityRestrictions(
  currentUser: PrivateUser,
  communityId: string,
  input: ActivateCommunityRestrictionsInput,
): Promise<CommunityRestriction[]> {
  const restrictionTypes = normalizeRestrictionTypes(input.restrictionTypes)
  assert(restrictionTypes.length > 0, 422, 'At least one restriction type is required')
  if (input.expiresAt !== null) {
    assert(input.expiresAt > new Date(), 422, 'expires_at must be in the future')
  }
  if (input.reason) {
    assert(
      input.reason.trim() === input.reason,
      422,
      'Reason must not have leading or trailing whitespace',
    )
    assert(input.reason.length <= 1000, 422, 'Reason must be at most 1000 characters')
  }

  const [community, membership] = await Promise.all([
    getCommunity(communityId),
    getCommunityMember(communityId, currentUser.id),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')

  await using query = await beginTransaction()
  const restrictions = await activateCommunityRestrictionTypes(
    query,
    currentUser.id,
    communityId,
    restrictionTypes,
    input,
  )
  await query.commit()

  await recordModeratorAction(currentUser.id, {
    actionType: 'activate_restriction',
    communityId,
    reason: input.reason ?? null,
    metadata: {
      restriction_ids: restrictions.map(restriction => restriction.id),
      restriction_types: restrictions.map(restriction => restriction.restriction_type),
      expires_at: input.expiresAt?.toISOString() ?? null,
    },
  })

  return restrictions
}

async function activateCommunityRestrictionTypes(
  query: import('@data-stores/psql/types').QueryExecutor,
  currentUserId: string,
  communityId: string,
  restrictionTypes: CommunityRestrictionType[],
  input: ActivateCommunityRestrictionsInput,
): Promise<CommunityRestriction[]> {
  const { rows } = await write(
    sql`/* activateCommunityRestrictions:insert */
    WITH restriction_input AS (
      SELECT restriction_type, ordinal
      FROM unnest(${restrictionTypes}::community_restriction_types[])
        WITH ORDINALITY AS input(restriction_type, ordinal)
    ), inserted AS (
      INSERT INTO community_restrictions (
      community_id,
      restriction_type,
      activated_by_id,
      expires_at,
      reason
    )
      SELECT ${communityId}, restriction_type, ${currentUserId}, ${input.expiresAt}, ${input.reason ?? null}
      FROM restriction_input
      ORDER BY ordinal
      RETURNING *
    )
    SELECT inserted.*
    FROM inserted
    JOIN restriction_input USING (restriction_type)
    ORDER BY restriction_input.ordinal
    `,
    { query },
  )

  return rows as CommunityRestriction[]
}

function normalizeRestrictionTypes(
  restrictionTypes: CommunityRestrictionType[],
): CommunityRestrictionType[] {
  const allowedTypes = new Set(COMMUNITY_RESTRICTION_TYPES)
  const seenTypes = new Set<CommunityRestrictionType>()
  const normalized: CommunityRestrictionType[] = []
  for (const restrictionType of restrictionTypes) {
    assert(allowedTypes.has(restrictionType), 422, 'Invalid restriction_type')
    if (!seenTypes.has(restrictionType)) {
      seenTypes.add(restrictionType)
      normalized.push(restrictionType)
    }
  }
  return normalized.sort(
    (a, b) => COMMUNITY_RESTRICTION_TYPES.indexOf(a) - COMMUNITY_RESTRICTION_TYPES.indexOf(b),
  )
}
