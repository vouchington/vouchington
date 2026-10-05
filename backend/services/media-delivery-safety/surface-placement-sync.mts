import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import type { ImagePlacementTuple } from '@voucha/types/entities/user'
import sql from 'sql-template-strings'
import {
  imageSurfaceWhere as surfaceWhere,
  lockImageSurfacePlacements,
  type ImageSurfaceReference,
} from './surface-lock.mts'
import { prepublishImagePlacementDenial } from './delivery-registry-publish.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { lockImageAssetAdmission, assertImagesReadyForSurface } from './asset-admission-lock.mts'
import { ensureImagePlacementBinding } from './retained-image-identities.mts'

export type { ImagePlacementTuple } from '@voucha/types/entities/user'

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
  requestedImageId: string | null,
  actorUserId: string | null,
  query: TransactionQuery,
): Promise<ImagePlacementTuple | null> {
  if (requestedImageId && !actorUserId) {
    throw new Error('An image surface activation requires an actor')
  }
  await lockImageAssetAdmission(requestedImageId ? [requestedImageId] : [], query)
  const { rows: canonical } = await query<{ id: string | null }>(
    sql`/* syncImageSurfacePlacement:canonicalAsset */ SELECT ${requestedImageId}::uuid::text AS id`,
  )
  const imageId = canonical[0]!.id
  await lockImageSurfacePlacements([reference], query)
  // The pre-denial and retirement share this lock domain with recovery.  Re-read after acquiring
  // it: the tuple observed before the advisory lock is never authority to publish or retire.
  const current = await getImageSurfacePlacement(reference, query)
  if (current?.image_id === imageId) return current
  await assertImagesReadyForSurface(imageId ? [imageId] : [], query)

  if (current && current.image_id !== imageId) {
    await prepublishImagePlacementDenial(
      {
        placementId: current.placement_id,
        revision: current.placement_revision,
        imageId: current.image_id,
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
  let activated = false
  if (placement) {
    const { rows } = await query<ImagePlacementTuple>(sql`/* syncImageSurfacePlacement:reactivate */
      UPDATE media_placements
      SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1
      WHERE id = ${placement.placement_id} AND retired_at IS NOT NULL
      RETURNING id AS placement_id, revision AS placement_revision, ${imageId}::uuid AS image_id
    `)
    if (rows[0]) {
      placement = rows[0]
      activated = true
    }
  } else {
    const columns = surfaceColumns(reference)
    const { rows: allocated } = await query<{ id: string }>(
      sql`/* syncImageSurfacePlacement:allocate */ SELECT uuidv7() AS id`,
    )
    const placementId = allocated[0]!.id
    await ensureImagePlacementBinding(query, {
      placementId,
      imageId,
      bindingFamily: 'surface',
    })
    const { rows } = await query<ImagePlacementTuple>(sql`/* syncImageSurfacePlacement:create */
      WITH inserted_placement AS (
        INSERT INTO media_placements (id) VALUES (${placementId})
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
    activated = true
  }
  if (activated) {
    await query(sql`/* syncImageSurfacePlacement:activation */
      INSERT INTO image_surface_placement_activations (
        placement_id, surface_kind, placement_revision, bound_by_user_id,
        uploaded_by_user_id, bound_by_administrator
      )
      SELECT ${placement.placement_id}, surface.surface_kind, ${placement.placement_revision},
        ${actorUserId}, image.created_by_id,
        CASE WHEN surface.surface_kind IN ('community-profile-image', 'community-banner-image')
          THEN EXISTS (
            SELECT 1 FROM user_roles role
            JOIN user_role_types role_type ON role_type.id = role.role_type_id
            WHERE role.user_id = ${actorUserId} AND role_type.slug = 'administrator'
          )
          ELSE NULL END
      FROM image_surface_placements surface
      JOIN images image ON image.id = surface.image_id
      WHERE surface.placement_id = ${placement.placement_id}
    `)
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
  return placement
}
