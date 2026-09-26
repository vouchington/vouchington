import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ProfileLink } from './profile-links.mts'

export async function listProfileLinks(userId: string): Promise<ProfileLink[]> {
  const { rows } = await read<ProfileLink>(
    sql`/* listProfileLinks */ SELECT pl.id, pl.user_id, pl.link_type, pl.sort_order, pl.url_id, u.url, pl.handle, pl.name, pl.image_id, pl.created_at, pl.updated_at,
      CASE WHEN placement.id IS NULL THEN NULL ELSE jsonb_build_object(
        'placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id
      ) END AS image_placement
        FROM user_profile_links pl
        LEFT JOIN urls u ON u.id = pl.url_id
        LEFT JOIN image_surface_placements surface
          ON surface.user_profile_link_id = pl.id AND surface.surface_kind = 'user-profile-link-image'
        LEFT JOIN media_placements placement
          ON placement.id = surface.placement_id AND placement.retired_at IS NULL
          AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
        WHERE pl.user_id = ${userId}
        ORDER BY pl.sort_order ASC, pl.id ASC`,
  )
  return rows
}
