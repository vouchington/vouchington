import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CommunityRestriction, CommunityRestrictionType } from '../types.mts'

export async function getActiveCommunityRestrictions(
  communityId: string,
  options?: QueryOptions,
): Promise<CommunityRestriction[]> {
  const { rows } = await read(
    sql`/* getActiveCommunityRestrictions */
    SELECT *
    FROM community_restrictions
    WHERE community_id = ${communityId}
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY activated_at ASC, id ASC
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
