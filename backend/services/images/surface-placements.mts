import type { QueryExecutor } from '@data-stores/psql/types'
import type { ImagePlacementTuple } from '@voucha/types/entities/user'
import type { ImagePlacementRetirement } from './placements.mts'
import sql from 'sql-template-strings'
import {
  publishImagePlacementDeliveryRecord,
  publishLegacyImageDeliveryRecord,
  stageImagePlacementDeliveryRecord,
} from '@services/media-delivery-safety'

export type { ImagePlacementTuple } from '@voucha/types/entities/user'

type ImageSurfaceReference =
  | { surfaceKind: 'user-profile-image'; userId: string }
  | { surfaceKind: 'topic-logo-image' | 'topic-hero-image'; topicId: string }
  | { surfaceKind: 'community-profile-image' | 'community-banner-image'; communityId: string }
  | { surfaceKind: 'user-profile-link-image'; userProfileLinkId: string }

function surfaceWhere(reference: ImageSurfaceReference): ReturnType<typeof sql> {
  if ('userId' in reference) {
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.user_id = ${reference.userId}`
  }
  if ('topicId' in reference) {
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.topic_id = ${reference.topicId}`
  }
  if ('communityId' in reference) {
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.community_id = ${reference.communityId}`
  }
  return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.user_profile_link_id = ${reference.userProfileLinkId}`
}

function surfaceColumns(reference: ImageSurfaceReference): {
  userId: string | null
  topicId: string | null
  communityId: string | null
  userProfileLinkId: string | null
} {
  return {
    userId: 'userId' in reference ? reference.userId : null,
    topicId: 'topicId' in reference ? reference.topicId : null,
    communityId: 'communityId' in reference ? reference.communityId : null,
    userProfileLinkId: 'userProfileLinkId' in reference ? reference.userProfileLinkId : null,
  }
}

/** Returns only the current public-use tuple. Retired bindings intentionally have no browser URL. */
export async function getImageSurfacePlacement(
  reference: ImageSurfaceReference,
  query: QueryExecutor,
): Promise<ImagePlacementTuple | null> {
  const statement = sql`/* getImageSurfacePlacement */
    SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id
    FROM image_surface_placements surface
    JOIN media_placements placement ON placement.id = surface.placement_id
    WHERE `
  statement.append(surfaceWhere(reference))
  statement.append(sql` AND placement.retired_at IS NULL
    ORDER BY placement.id DESC
    LIMIT 1
  `)
  const { rows } = await query<ImagePlacementTuple>(statement)
  return rows[0] ?? null
}

/** Changes a typed public-use surface atomically while retaining immutable legal-evidence bindings. */
export async function syncImageSurfacePlacement(
  reference: ImageSurfaceReference,
  imageId: string | null,
  query: QueryExecutor,
): Promise<ImagePlacementTuple | null> {
  await assertImageReadyForPublicSurface(imageId, query)
  const current = await getImageSurfacePlacement(reference, query)
  if (current?.image_id === imageId) return current

  if (current && current.image_id !== imageId) {
    await publishImagePlacementDeliveryRecord(
      {
        placementId: current.placement_id,
        revision: current.placement_revision,
        imageId: current.image_id,
        state: 'withheld',
      },
      { query },
    )
  }
  const retireStatement = sql`/* syncImageSurfacePlacement:retire */
    UPDATE media_placements placement
    SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
        retirement_reason = 'owner_removed',
        revision = placement.revision + 1
    FROM image_surface_placements surface
    WHERE surface.placement_id = placement.id
      AND placement.retirement_reason IS DISTINCT FROM 'owner_removed'
      AND surface.image_id IS DISTINCT FROM ${imageId}::uuid
      AND `
  retireStatement.append(surfaceWhere(reference))
  await query(retireStatement)
  if (!imageId) return null

  const existingStatement = sql`/* syncImageSurfacePlacement:existing */
    SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id
    FROM image_surface_placements surface
    JOIN media_placements placement ON placement.id = surface.placement_id
    WHERE `
  existingStatement.append(surfaceWhere(reference))
  existingStatement.append(sql` AND surface.image_id = ${imageId}
    ORDER BY placement.id DESC
    LIMIT 1
    FOR UPDATE OF placement
  `)
  const existing = await query<ImagePlacementTuple>(existingStatement)
  let placement = existing.rows[0]
  if (placement) {
    const { rows } = await query<ImagePlacementTuple>(sql`/* syncImageSurfacePlacement:reactivate */
      UPDATE media_placements
      SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1
      WHERE id = ${placement.placement_id} AND retired_at IS NOT NULL
      RETURNING id AS placement_id, revision AS placement_revision, ${imageId}::uuid AS image_id
    `)
    placement = rows[0] ?? placement
  } else {
    const columns = surfaceColumns(reference)
    const { rows } = await query<ImagePlacementTuple>(sql`/* syncImageSurfacePlacement:create */
      WITH inserted_placement AS (
        INSERT INTO media_placements (placement_kind) VALUES ('image')
        RETURNING id, revision
      ), inserted_surface AS (
        INSERT INTO image_surface_placements (
          placement_id, surface_kind, image_id, user_id, topic_id, community_id, user_profile_link_id
        )
        SELECT id, ${reference.surfaceKind}, ${imageId}, ${columns.userId}, ${columns.topicId},
          ${columns.communityId}, ${columns.userProfileLinkId}
        FROM inserted_placement
        RETURNING placement_id, image_id
      )
      SELECT placement_id, inserted_placement.revision AS placement_revision, image_id
      FROM inserted_surface JOIN inserted_placement ON inserted_placement.id = inserted_surface.placement_id
    `)
    placement = rows[0]!
  }
  await stageImagePlacementDeliveryRecord(
    {
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId: placement.image_id,
      state: 'allow',
    },
    { query },
  )
  await publishLegacyImageDeliveryRecord(placement.image_id, 'withheld', { query })
  return placement
}

export async function retireImageSurfacePlacementsForDeletedImage(
  imageId: string,
  query: QueryExecutor,
): Promise<ImagePlacementRetirement[]> {
  const { rows } = await query<{ placement_id: string; revision: number }>(
    sql`/* retireImageSurfacePlacementsForDeletedImage */
      UPDATE media_placements placement
      SET retired_at = CURRENT_TIMESTAMP,
          retirement_reason = 'asset_deleted',
          revision = placement.revision + 1
      FROM image_surface_placements surface
      WHERE surface.placement_id = placement.id
        AND surface.image_id = ${imageId}
        AND placement.retired_at IS NULL
      RETURNING placement.id AS placement_id, placement.revision
    `,
  )
  return rows.map(row => ({ placementId: row.placement_id, revision: row.revision }))
}

async function assertImageReadyForPublicSurface(
  imageId: string | null,
  query: QueryExecutor,
): Promise<void> {
  if (!imageId) return
  const { rows } = await query(sql`/* assertImageReadyForPublicSurface */
    SELECT id
    FROM images
    WHERE id = ${imageId}
      AND deleted_at IS NULL
      AND upload_completed_at IS NOT NULL
      AND quarantine_pending_at IS NULL
      AND openai_omni_moderation_flagged = FALSE
      AND openai_omni_moderation_results IS NOT NULL
      AND openai_omni_moderation_created_at IS NOT NULL
    FOR SHARE
  `)
  if (rows.length !== 1) throw new Error('Image is not ready for a public surface')
}
