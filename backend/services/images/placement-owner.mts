import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type CopyrightPlacementOwner =
  | { kind: 'post'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'topic'; id: string }
  | { kind: 'community'; id: string }

/** Resolves the host whose cache must be invalidated after a placement transition. */
export async function getImagePlacementCopyrightOwner(
  placementId: string,
  options: QueryOptions = {},
): Promise<CopyrightPlacementOwner | null> {
  const query = options.query ?? read
  const { rows } = await query<{
    post_id: string | null
    user_id: string | null
    topic_id: string | null
    community_id: string | null
  }>(sql`/* getImagePlacementCopyrightOwner */
    SELECT post_binding.post_id, COALESCE(surface.user_id, link.user_id) AS user_id,
      surface.topic_id, surface.community_id
    FROM media_placements placement
    LEFT JOIN image_placements post_binding ON post_binding.placement_id = placement.id
    LEFT JOIN image_surface_placements surface ON surface.placement_id = placement.id
    LEFT JOIN user_profile_links link ON link.id = surface.user_profile_link_id
    WHERE placement.id = ${placementId}
  `)
  const owner = rows[0]
  if (!owner) return null
  if (owner.post_id) return { kind: 'post', id: owner.post_id }
  if (owner.user_id) return { kind: 'user', id: owner.user_id }
  if (owner.topic_id) return { kind: 'topic', id: owner.topic_id }
  if (owner.community_id) return { kind: 'community', id: owner.community_id }
  return null
}
