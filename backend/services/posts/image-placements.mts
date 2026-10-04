import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { runSequentially } from '@modules/utils/run-sequentially'
import { ensureImagePlacementBinding } from '@services/media-delivery-safety'

export type PostImagePlacement = {
  placement_id: string
  placement_revision: number
  image_id: string
  order_index: number
  caption: string
}

/** Retires every hosted image use for a deleted post in the deletion transaction. */
export async function retirePostImagePlacements(
  postId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* retirePostImagePlacements */
    UPDATE media_placements placement
    SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
        retirement_reason = 'owner_removed',
        revision = placement.revision + 1
    FROM image_placements image_placement
    WHERE image_placement.placement_id = placement.id
      AND image_placement.post_id = ${postId}
      AND placement.retirement_reason IS DISTINCT FROM 'owner_removed'
  `)
}

/** Keeps post attachment identity stable while making removed attachment routes fail closed. */
export async function syncPostImagePlacements(
  postId: string,
  imageIds: string[],
  query: TransactionQuery,
): Promise<void> {
  const distinctImageIds = [...new Set(imageIds)]
  await query(sql`/* syncPostImagePlacements:lockExisting */
    SELECT placement.id
    FROM image_placements image_placement
    JOIN media_placements placement ON placement.id = image_placement.placement_id
    WHERE image_placement.post_id = ${postId}
    ORDER BY placement.id
    FOR UPDATE OF placement
  `)
  await query(sql`/* syncPostImagePlacements:retireAbsent */
    UPDATE media_placements placement
    SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
        retirement_reason = 'owner_removed',
        revision = placement.revision + 1
    FROM image_placements image_placement
    WHERE image_placement.placement_id = placement.id
      AND image_placement.post_id = ${postId}
      AND placement.retirement_reason IS DISTINCT FROM 'owner_removed'
      AND NOT (image_placement.image_id = ANY(${distinctImageIds}::uuid[]))
  `)
  if (distinctImageIds.length === 0) return
  await runSequentially([
    () =>
      query(sql`/* syncPostImagePlacements:reactivateExisting */
    UPDATE media_placements placement
    SET retired_at = NULL,
        retirement_reason = NULL,
        revision = placement.revision + 1
    FROM image_placements image_placement
    WHERE image_placement.placement_id = placement.id
      AND image_placement.post_id = ${postId}
      AND image_placement.image_id = ANY(${distinctImageIds}::uuid[])
      AND placement.retired_at IS NOT NULL
    `),
    async () => {
      const { rows: missing } = await query<{ image_id: string }>(sql`
        /* syncPostImagePlacements:missing */
        SELECT requested.image_id
        FROM UNNEST(${distinctImageIds}::uuid[]) AS requested(image_id)
        WHERE NOT EXISTS (
          SELECT 1 FROM image_placements existing
          WHERE existing.post_id = ${postId} AND existing.image_id = requested.image_id
        )
        ORDER BY requested.image_id
      `)
      for (const binding of missing) {
        // oxlint-disable-next-line no-await-in-loop -- each retained tuple commits before its live owner row.
        const { rows: allocated } = await query<{ placement_id: string }>(sql`
          /* syncPostImagePlacements:allocate */ SELECT uuidv7() AS placement_id
        `)
        const placementId = allocated[0]!.placement_id
        // oxlint-disable-next-line no-await-in-loop -- image then binding pins remain held by this transaction.
        await ensureImagePlacementBinding(query, {
          placementId,
          imageId: binding.image_id,
          bindingFamily: 'post',
        })
        // oxlint-disable-next-line no-await-in-loop -- placements are immutable exact-pair owners.
        await query(sql`/* syncPostImagePlacements:createParent */
          INSERT INTO media_placements (id) VALUES (${placementId})
        `)
        // oxlint-disable-next-line no-await-in-loop -- parent FK must exist before its child.
        await query(sql`/* syncPostImagePlacements:createChild */
          INSERT INTO image_placements (placement_id, post_id, image_id)
          VALUES (${placementId}, ${postId}, ${binding.image_id})
        `)
      }
    },
    () =>
      query(sql`/* syncPostImagePlacements:stageDelivery */
    INSERT INTO media_delivery_registry_records (
      delivery_key, placement_id, placement_revision, image_id, desired_state
    )
    SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', binding.image_id),
      placement.id, placement.revision, binding.image_id, 'allow'::media_delivery_desired_states
    FROM image_placements binding
    JOIN media_placements placement ON placement.id = binding.placement_id
    JOIN images image ON image.id = binding.image_id
    WHERE binding.post_id = ${postId}
      AND placement.retired_at IS NULL AND placement.copyright_withheld_at IS NULL
      AND image.deleted_at IS NULL AND image.upload_completed_at IS NOT NULL
      AND image.quarantine_pending_at IS NULL AND image.openai_omni_moderation_flagged = FALSE
      AND image.openai_omni_moderation_results IS NOT NULL
      AND image.openai_omni_moderation_created_at IS NOT NULL
    ON CONFLICT (delivery_key) DO NOTHING
    `),
  ])
}
