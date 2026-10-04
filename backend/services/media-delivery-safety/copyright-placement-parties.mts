import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import { DELETED_USER_ID } from '@voucha/types/entities/user-constants'

export type CopyrightPlacementPartyPurpose = 'notify' | 'respond' | 'inform' | 'strike' | 'retain'

/** @public Integration seam: checks every purpose against the same production party query. */
export async function selectCopyrightPlacementPartyUserIds(
  targetId: string,
  purpose: CopyrightPlacementPartyPurpose,
): Promise<string[]> {
  const statement = sql`/* selectCopyrightPlacementPartyUserIds */
    SELECT DISTINCT party.user_id
    FROM copyright_notice_targets target
    CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql(purpose))
  statement.append(sql` party
    WHERE target.id = ${targetId}
    ORDER BY party.user_id`)
  const { rows } = await read<{ user_id: string }>(statement)
  return rows.map(row => row.user_id)
}

/** Correlated to `target`; selects the one immutable target's parties under a single policy table. */
export function copyrightPlacementPartiesSql(
  purpose: CopyrightPlacementPartyPurpose,
): ReturnType<typeof sql> {
  const live = purpose !== 'retain'
  const includeResponders = purpose !== 'inform'
  const includeCommunityOwners = purpose === 'inform'
  const includeRetainedAdministrators = purpose === 'retain'
  const parties = sql`(
    SELECT post.created_by_id AS user_id, 'post_author'::text AS basis
    FROM image_placements post_binding
    JOIN posts post ON post.id = post_binding.post_id
    WHERE post_binding.placement_id = target.placement_id
      AND `
  parties.append(includeResponders ? sql`TRUE` : sql`FALSE`)
  if (live)
    parties.append(sql` AND post.created_by_id <> ${DELETED_USER_ID} AND EXISTS (
    SELECT 1 FROM users account WHERE account.id = post.created_by_id
      AND account.deleted_at IS NULL)`)
  parties.append(sql`
    UNION ALL
    SELECT CASE WHEN ${live} THEN surface.user_id
      ELSE target.surface_owner_user_id END AS user_id,
      'profile_owner'::text AS basis
    FROM image_surface_placements surface
    WHERE surface.placement_id = target.placement_id
      AND surface.surface_kind = 'user-profile-image'
      AND `)
  parties.append(includeResponders ? sql`TRUE` : sql`FALSE`)
  if (live)
    parties.append(sql` AND EXISTS (
    SELECT 1 FROM users account WHERE account.id = surface.user_id
      AND account.deleted_at IS NULL)`)
  parties.append(sql`
    UNION ALL
    SELECT CASE WHEN ${live} THEN link.user_id
      ELSE target.surface_owner_user_id END AS user_id,
      'profile_owner'::text AS basis
    FROM image_surface_placements surface
    LEFT JOIN user_profile_links link ON link.id = surface.user_profile_link_id
    WHERE surface.placement_id = target.placement_id
      AND surface.surface_kind = 'user-profile-link-image'
      AND `)
  parties.append(includeResponders ? sql`TRUE` : sql`FALSE`)
  if (live)
    parties.append(sql` AND EXISTS (
    SELECT 1 FROM users account WHERE account.id = link.user_id
      AND account.deleted_at IS NULL)`)
  parties.append(sql`
    UNION ALL
    SELECT activation.bound_by_user_id AS user_id, 'activation_binder'::text AS basis
    FROM image_surface_placements surface
    JOIN LATERAL (
      SELECT recorded.bound_by_user_id, recorded.bound_by_administrator
      FROM image_surface_placement_activations recorded
      WHERE recorded.placement_id = surface.placement_id
        AND recorded.placement_revision = target.surface_activation_revision
    ) activation ON true
    WHERE surface.placement_id = target.placement_id
      AND surface.surface_kind IN ('community-profile-image', 'community-banner-image')
      AND `)
  parties.append(includeResponders ? sql`TRUE` : sql`FALSE`)
  parties.append(sql` AND (`)
  parties.append(includeRetainedAdministrators ? sql`TRUE` : sql`FALSE`)
  parties.append(sql` OR activation.bound_by_administrator = FALSE)`)
  if (live)
    parties.append(sql` AND EXISTS (
    SELECT 1 FROM users account WHERE account.id = activation.bound_by_user_id
      AND account.deleted_at IS NULL)`)
  parties.append(sql`
    UNION ALL
    SELECT member.user_id, 'community_owner'::text AS basis
    FROM image_surface_placements surface
    JOIN community_members member ON member.community_id = surface.community_id
      AND member.role = 'owner' AND member.removed_at IS NULL
    LEFT JOIN LATERAL (
      SELECT recorded.bound_by_user_id
      FROM image_surface_placement_activations recorded
      WHERE recorded.placement_id = surface.placement_id
        AND recorded.placement_revision = target.surface_activation_revision
    ) activation ON true
    WHERE surface.placement_id = target.placement_id
      AND surface.surface_kind IN ('community-profile-image', 'community-banner-image')
      AND `)
  parties.append(includeCommunityOwners ? sql`TRUE` : sql`FALSE`)
  parties.append(sql` AND member.user_id IS DISTINCT FROM activation.bound_by_user_id`)
  if (live)
    parties.append(sql` AND EXISTS (
    SELECT 1 FROM users account WHERE account.id = member.user_id
      AND account.deleted_at IS NULL)`)
  parties.append(sql`
  )`)
  return parties
}
