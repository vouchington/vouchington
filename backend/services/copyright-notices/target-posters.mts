import sql, { type SQLStatement } from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'

export type PosterPurpose = 'notify' | 'inform'
export type TargetPoster = {
  target_id: string
  user_id: string
  recipient_role: 'poster' | 'informed_owner'
  target_path: string | null
  purpose: PosterPurpose
}

/** The recipients union without its ordering or annotation, so a caller can fold it into a larger statement. */
export function copyrightTargetPostersSql(
  targetIds: readonly string[],
  purposes: readonly PosterPurpose[],
): SQLStatement {
  const statement = sql``
  for (const [index, purpose] of purposes.entries()) {
    if (index > 0) statement.append(' UNION ALL ')
    statement.append(posterBranch(purpose, targetIds))
  }
  return statement
}

function posterBranch(purpose: PosterPurpose, targetIds: readonly string[]): SQLStatement {
  const branch = sql`(
    SELECT DISTINCT target.id AS target_id, party.user_id,
      ${purpose === 'inform' ? 'informed_owner' : 'poster'}::text AS recipient_role,
      CASE WHEN ${purpose === 'inform'} THEN '/communities/' || COALESCE(community.slug, community.id::text)
        ELSE NULL END AS target_path,
      ${purpose}::text AS purpose
    FROM copyright_notice_targets target
    LEFT JOIN image_surface_placements surface ON surface.placement_id = target.placement_id
    LEFT JOIN communities community ON community.id = surface.community_id
    CROSS JOIN LATERAL `
  branch.append(copyrightPlacementPartiesSql(purpose))
  branch.append(sql` party
    WHERE target.id = ANY(${targetIds}::uuid[])
  )`)
  return branch
}
