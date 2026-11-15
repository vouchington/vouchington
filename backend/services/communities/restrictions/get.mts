import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CommunityRestriction, CommunityRestrictionType } from '../types.mts'
import { COMMUNITY_RESTRICTION_TYPES } from './types.mts'

/** Earliest active restriction of each type, sufficient for all enforcement decisions. */
export async function getActiveCommunityRestrictions(
  communityId: string,
  options?: QueryOptions,
): Promise<CommunityRestriction[]> {
  const { rows } = await read(
    sql`/* getActiveCommunityRestrictions */
    SELECT restriction.*
    FROM unnest(${COMMUNITY_RESTRICTION_TYPES}::community_restriction_types[]) AS requested(restriction_type)
    JOIN LATERAL (
      SELECT id, community_id, restriction_type, activated_by_id, activated_at, expires_at,
        created_at, updated_at, lifted_at, lifted_by_id, reason
      FROM community_restrictions
      WHERE community_id = ${communityId}
        AND restriction_type = requested.restriction_type
        AND lifted_at IS NULL
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY activated_at ASC, id ASC
      LIMIT 1
    ) restriction ON TRUE
    ORDER BY restriction.activated_at ASC, restriction.id ASC
    `,
    options,
  )
  return rows as CommunityRestriction[]
}

export function activeRestrictionSet(
  restrictions: CommunityRestriction[],
): Set<CommunityRestrictionType> {
  return new Set(restrictions.map(restriction => restriction.restriction_type))
}
