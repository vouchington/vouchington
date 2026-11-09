import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { imageSurfaceReferences, type ImageSurfaceReference } from './surface-lock.mts'

export type ImageSurfaceMutation = ImageSurfaceReference & { nextImageId: string | null }
export type ImageSurfaceMutationBinding = {
  ordinality: string
  current_image_id: string | null
  placement_id: string | null
  placement_revision: number | null
  activation_revision: number | null
  image_id: string | null
}

export async function readSurfaceBindings(
  query: TransactionQuery,
  references: readonly ImageSurfaceMutation[],
): Promise<ImageSurfaceMutationBinding[]> {
  const statement = sql`/* readImageSurfaceMutationBindings */ WITH refs AS (`
  statement.append(imageSurfaceReferences([...references]))
  statement.append(sql`), owners AS (
    SELECT refs.*, CASE
      WHEN refs.surface_kind = 'user-profile-image' THEN account.profile_image_id
      WHEN refs.surface_kind = 'topic-logo-image' THEN topic.logo_image_id
      WHEN refs.surface_kind = 'topic-hero-image' THEN topic.hero_image_id
      WHEN refs.surface_kind = 'community-profile-image' THEN community.profile_image_id
      WHEN refs.surface_kind = 'community-banner-image' THEN community.banner_image_id
      WHEN refs.surface_kind = 'user-profile-link-image' THEN link.image_id
      END AS current_image_id
    FROM refs
    LEFT JOIN users account ON account.id = refs.user_id AND account.deleted_at IS NULL
    LEFT JOIN topics topic ON topic.id = refs.topic_id AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
    LEFT JOIN communities community ON community.id = refs.community_id AND community.deleted_at IS NULL
    LEFT JOIN user_profile_links link ON link.id = refs.user_profile_link_id
  ) SELECT owners.ordinality, owners.current_image_id,
    placement.id AS placement_id, placement.revision AS placement_revision,
    placement.activation_revision, surface.image_id
  FROM owners LEFT JOIN image_surface_placements surface
    ON surface.surface_kind = owners.surface_kind AND surface.image_id = owners.current_image_id
      AND (surface.user_id = owners.user_id OR surface.topic_id = owners.topic_id
        OR surface.community_id = owners.community_id OR surface.user_profile_link_id = owners.user_profile_link_id)
  LEFT JOIN media_placements placement ON placement.id = surface.placement_id AND placement.retired_at IS NULL
  ORDER BY owners.ordinality`)
  return (await query<ImageSurfaceMutationBinding>(statement)).rows
}
