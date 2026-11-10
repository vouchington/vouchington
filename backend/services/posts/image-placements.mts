import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import {
  admitImagePlacements,
  projectImagePlacementPolicy,
  withImagePlacementMutation,
  type ImagePlacementAdmission,
} from '@services/media-delivery-safety/placement-capacity-reservations'
import { settleImagePlacementDeliveryChanges } from '@services/media-delivery-safety/delivery-registry-publish'

export type PostImagePlacement = {
  placement_id: string
  placement_revision: number
  image_id: string
  order_index: number
  caption: string
}
type ActivePlacement = {
  placement_id: string
  revision: number
  activation_revision: number
  image_id: string
  can_publish: boolean
}

/** The actual post deletion precedes this uncommitted lifecycle/capacity/edge settlement. */
export function retirePostImagePlacements(postId: string, query: TransactionQuery): Promise<void> {
  return syncPostImagePlacements(postId, [], query)
}

/** Count new image admissions, write the placement rows, then deny old delivery tuples. */
export async function syncPostImagePlacements(
  postId: string,
  imageIds: string[],
  parentQuery: TransactionQuery,
): Promise<void> {
  await withImagePlacementMutation(
    parentQuery,
    async query => {
      const desired = [...new Set(imageIds.map(id => id.toLowerCase()))].toSorted()
      const { rows: before } =
        await query<ActivePlacement>(sql`/* syncPostImagePlacements:current */
    SELECT binding.placement_id, placement.revision, placement.activation_revision, binding.image_id,
      false AS can_publish
    FROM image_placements binding
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE binding.post_id = ${postId} AND placement.retired_at IS NULL
    ORDER BY binding.image_id, binding.placement_id`)
      const wanted = new Set(desired)
      const removed = before.filter(row => !wanted.has(row.image_id))
      const activeImages = new Set(before.map(row => row.image_id))
      const admissions: ImagePlacementAdmission[] = []
      for (const imageId of desired) {
        if (!activeImages.has(imageId)) admissions.push({ imageId })
      }
      await admitImagePlacements(query, admissions)
      const { rows: retired } =
        removed.length > 0
          ? await query<{
              placement_id: string
              revision: number
            }>(sql`/* syncPostImagePlacements:retireAbsent */
    UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP, retirement_reason = 'owner_removed', revision = revision + 1
    WHERE id = ANY(${removed.map(row => row.placement_id)}::uuid[]) AND retired_at IS NULL
    RETURNING WITH (OLD AS prior) id AS placement_id, prior.revision`)
          : { rows: [] }

      if (desired.length > 0) {
        await query(sql`/* syncPostImagePlacements:reactivateExisting */
      UPDATE media_placements placement SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1
      FROM image_placements binding
      WHERE binding.placement_id = placement.id AND binding.post_id = ${postId}
        AND binding.image_id = ANY(${desired}::uuid[]) AND placement.retired_at IS NOT NULL`)
        await query(sql`/* syncPostImagePlacements:createMissing */
      WITH allocated AS MATERIALIZED (
        SELECT uuidv7() AS placement_id, requested.image_id
        FROM unnest(${desired}::uuid[]) requested(image_id)
        WHERE NOT EXISTS (SELECT 1 FROM image_placements binding
          WHERE binding.post_id = ${postId} AND binding.image_id = requested.image_id)
        ORDER BY requested.image_id
      ), retained AS (
        INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
        SELECT placement_id, image_id, 'post' FROM allocated ORDER BY placement_id
        RETURNING placement_id, image_id
      ), parents AS (
        INSERT INTO media_placements (id) SELECT placement_id FROM retained ORDER BY placement_id RETURNING id
      ) INSERT INTO image_placements (placement_id, post_id, image_id)
        SELECT parents.id, ${postId}, retained.image_id FROM parents
        JOIN retained ON retained.placement_id = parents.id ORDER BY parents.id`)
      }

      const { rows: after } = desired.length
        ? await query<ActivePlacement>(sql`/* syncPostImagePlacements:desired */
    SELECT binding.placement_id, placement.revision, placement.activation_revision, binding.image_id,
      placement.copyright_withheld_at IS NULL AND image.deleted_at IS NULL
        AND image.upload_completed_at IS NOT NULL AND image.quarantine_pending_at IS NULL
        AND image.is_flagged_by_openai_omni_moderation = FALSE AND image.openai_omni_moderation_results IS NOT NULL
        AND image.openai_omni_moderation_created_at IS NOT NULL AS can_publish
    FROM unnest(${desired}::uuid[]) requested(image_id)
    JOIN image_placements binding ON binding.post_id = ${postId} AND binding.image_id = requested.image_id
    JOIN media_placements placement ON placement.id = binding.placement_id AND placement.retired_at IS NULL
    JOIN images image ON image.id = binding.image_id
    ORDER BY binding.image_id, binding.placement_id`)
        : { rows: [] }
      assert(after.length === desired.length, 400, 'Image not found or not complete')
      await projectImagePlacementPolicy(
        query,
        after.map(row => row.placement_id),
      )
      const removedById = new Map(removed.map(row => [row.placement_id, row.image_id]))
      return {
        denied: retired.map(row => ({
          placementId: row.placement_id,
          revision: row.revision,
          imageId: removedById.get(row.placement_id)!,
        })),
        allows: after.flatMap(row =>
          row.can_publish
            ? [
                {
                  placementId: row.placement_id,
                  revision: row.revision,
                  imageId: row.image_id,
                  state: 'allow' as const,
                },
              ]
            : [],
        ),
      }
    },
    async (plan, query) => {
      await settleImagePlacementDeliveryChanges(plan.denied, plan.allows, { query })
    },
  )
}
