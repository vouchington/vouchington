import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { imageSurfaceReferences, type ImageSurfaceReference } from './surface-lock.mts'

export type ImageSurfaceMutation = ImageSurfaceReference & { nextImageId: string | null }
export type ImageSurfaceMutationBinding = {
  ordinality: string
  previous_image_id: string | null
  current_image_id: string | null
  previous_placement_id: string | null
  previous_activation_revision: number | null
  previous_placement_revision: number | null
  prior_denial_revision: number | null
  placement_id: string | null
  placement_revision: number | null
  activation_revision: number | null
  image_id: string | null
}

export type ImageSurfaceMutationChange = {
  ordinality: number
  previousImageId: string | null
  currentImageId: string | null
  previousPlacementId: string | null
  previousPlacementRevision: number | null
  previousActivationRevision: number | null
  refreshOwnerCurrent?: boolean
}

export type ImageSurfaceMutationChangeRow = Pick<
  ImageSurfaceMutationChange,
  | 'previousImageId'
  | 'previousPlacementId'
  | 'previousPlacementRevision'
  | 'previousActivationRevision'
> & { ordinality: number | string; currentImageId: string | null; refreshOwnerCurrent?: boolean }

export function imageSurfaceMutationChange(
  row: ImageSurfaceMutationChangeRow,
): ImageSurfaceMutationChange {
  return { ...row, ordinality: Number(row.ordinality) }
}

export type ImageSurfaceMutationWrite<Result> = {
  result: Result
  changes: readonly ImageSurfaceMutationChange[]
  resultFromBindings?: (bindings: readonly ImageSurfaceMutationBinding[]) => Result
}

/** A materialized preimage shared by the owner CAS and its OLD/NEW RETURNING projection. */
export function imageSurfaceMutationPreimage(
  references: readonly (ImageSurfaceReference & { nextImageId?: string | null })[],
  annotation: string,
): ReturnType<typeof sql> {
  const statement = sql``
  statement.append(`/* ${annotation} */ WITH surface_preimage AS MATERIALIZED (WITH refs AS (`)
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
  ) SELECT owners.ordinality, owners.surface_kind, owners.user_id, owners.topic_id,
      owners.community_id, owners.user_profile_link_id, owners.current_image_id,
      placement.id AS placement_id, placement.revision AS placement_revision,
      placement.activation_revision, surface.image_id
    FROM owners LEFT JOIN image_surface_placements surface
      ON surface.surface_kind = owners.surface_kind AND surface.image_id = owners.current_image_id
        AND (surface.user_id = owners.user_id OR surface.topic_id = owners.topic_id
          OR surface.community_id = owners.community_id OR surface.user_profile_link_id = owners.user_profile_link_id)
    LEFT JOIN media_placements placement ON placement.id = surface.placement_id AND placement.retired_at IS NULL
  )`)
  return statement
}

export async function readSurfaceBindings(
  query: TransactionQuery,
  references: readonly ImageSurfaceMutation[],
  changes: readonly ImageSurfaceMutationChange[],
): Promise<ImageSurfaceMutationBinding[]> {
  const statement = sql`/* readImageSurfaceMutationBindings */ WITH refs AS (`
  statement.append(imageSurfaceReferences([...references]))
  statement.append(sql`), changes AS (SELECT * FROM unnest(
      ${changes.map(row => row.ordinality)}::bigint[],
      ${changes.map(row => row.previousImageId)}::uuid[],
      ${changes.map(row => row.currentImageId)}::uuid[],
      ${changes.map(row => row.previousPlacementId)}::uuid[],
      ${changes.map(row => row.previousPlacementRevision)}::integer[],
      ${changes.map(row => row.previousActivationRevision)}::integer[],
      ${changes.map(row => row.refreshOwnerCurrent ?? false)}::boolean[]
    ) AS value(ordinality, previous_image_id, current_image_id, previous_placement_id,
      previous_placement_revision, previous_activation_revision, refresh_owner_current)), owners AS (
    SELECT changes.ordinality, changes.previous_image_id,
      CASE WHEN changes.refresh_owner_current THEN CASE
        WHEN refs.surface_kind = 'user-profile-image' THEN account.profile_image_id
        WHEN refs.surface_kind = 'topic-logo-image' THEN topic.logo_image_id
        WHEN refs.surface_kind = 'topic-hero-image' THEN topic.hero_image_id
        WHEN refs.surface_kind = 'community-profile-image' THEN community.profile_image_id
        WHEN refs.surface_kind = 'community-banner-image' THEN community.banner_image_id
        WHEN refs.surface_kind = 'user-profile-link-image' THEN link.image_id
        END ELSE changes.current_image_id END AS current_image_id,
      changes.previous_placement_id, changes.previous_placement_revision,
      changes.previous_activation_revision, refs.surface_kind, refs.user_id, refs.topic_id,
      refs.community_id, refs.user_profile_link_id
    FROM changes JOIN refs ON refs.ordinality = changes.ordinality
    LEFT JOIN users account ON account.id = refs.user_id AND account.deleted_at IS NULL
    LEFT JOIN topics topic ON topic.id = refs.topic_id AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
    LEFT JOIN communities community ON community.id = refs.community_id AND community.deleted_at IS NULL
    LEFT JOIN user_profile_links link ON link.id = refs.user_profile_link_id
  ), current_binding AS (
    SELECT owners.ordinality, owners.previous_image_id, owners.current_image_id,
      owners.previous_placement_id, owners.previous_placement_revision,
      owners.previous_activation_revision, placement.id AS placement_id,
      placement.revision AS placement_revision, placement.activation_revision,
      surface.image_id
    FROM owners
    LEFT JOIN image_surface_placements surface
      ON surface.surface_kind = owners.surface_kind AND surface.image_id = owners.current_image_id
        AND (surface.user_id = owners.user_id OR surface.topic_id = owners.topic_id
          OR surface.community_id = owners.community_id OR surface.user_profile_link_id = owners.user_profile_link_id)
    LEFT JOIN media_placements placement ON placement.id = surface.placement_id AND placement.retired_at IS NULL
  ) SELECT current_binding.*,
      CASE WHEN previous.id IS NOT NULL
        AND previous.retirement_reason = 'owner_removed' AND previous.retired_at IS NOT NULL
        THEN previous.revision - 1 END AS prior_denial_revision
    FROM current_binding
    LEFT JOIN media_placements previous ON previous.id = current_binding.previous_placement_id
    ORDER BY current_binding.ordinality`)
  return (await query<ImageSurfaceMutationBinding>(statement)).rows
}
