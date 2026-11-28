import type { TransactionQuery } from '@data-stores/psql/types'
import { getMediaDeliverySafetyWorkLimit } from '@services/media-delivery-safety/work-limits'
import sql from 'sql-template-strings'

/** Retires every hosted image use for a deleted post in the deletion transaction. */
export async function retirePostImagePlacements(
  postId: string,
  query: TransactionQuery,
): Promise<void> {
  const batchSize = getMediaDeliverySafetyWorkLimit('recovery_page_size')
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch UPDATE retires placements for this deleted post
    // no-mistakes-disable-next-line query-reached-per-item: batched UPDATE retiring post image placements in DynamicConfig recovery_page_size pages (hard max 1000)
    const { rowCount } = await query(
      sql`/* retirePostImagePlacements */
      WITH target AS (
        SELECT placement.id
        FROM image_placements image_placement
        JOIN media_placements placement ON placement.id = image_placement.placement_id
        WHERE image_placement.post_id = ${postId}
          AND placement.retirement_reason IS DISTINCT FROM 'owner_removed'
        ORDER BY placement.id
        LIMIT ${batchSize}
      )
      UPDATE media_placements placement
      SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
          retirement_reason = 'owner_removed',
          revision = placement.revision + 1
      FROM target
      WHERE placement.id = target.id
    `,
    )
    // oxlint-enable no-await-in-loop
    if ((rowCount ?? 0) < batchSize) break
  }
}

export async function lockChangedPostImagePlacements(
  postId: string,
  distinctImageIds: readonly string[],
  query: TransactionQuery,
): Promise<void> {
  const batchSize = getMediaDeliverySafetyWorkLimit('recovery_page_size')
  let afterPlacementId: string | null = null
  while (true) {
    const cursorPlacementId: string | null = afterPlacementId
    // oxlint-disable-next-line no-await-in-loop -- keyset page locks changed placements in ascending placement.id order within this transaction
    const result: { rows: Array<{ id: string }> } = await query<{ id: string }>( // no-mistakes-disable-line query-reached-per-item: keyset pagination locking changed placements in ascending placement.id order in DynamicConfig recovery_page_size pages (hard max 1000)
      sql`/* syncPostImagePlacements:lockChangedPlacements */
        SELECT placement.id
        FROM image_placements image_placement
        JOIN media_placements placement ON placement.id = image_placement.placement_id
        WHERE image_placement.post_id = ${postId}
          AND (
            (image_placement.image_id = ANY(${distinctImageIds}::uuid[])
              AND placement.retired_at IS NOT NULL)
            OR (image_placement.image_id <> ALL(${distinctImageIds}::uuid[])
              AND placement.retirement_reason IS DISTINCT FROM 'owner_removed')
          )
          AND (${cursorPlacementId}::uuid IS NULL OR placement.id > ${cursorPlacementId}::uuid)
        ORDER BY placement.id ASC
        LIMIT ${batchSize}
        -- lock-reason: prevents: retiring and reviving overlapping placements in different row orders; writer: image placement synchronization and retirement.
        FOR UPDATE OF placement
      `,
    )
    if (result.rows.length < batchSize) break
    afterPlacementId = result.rows.at(-1)!.id
  }
}

export async function retireAbsentPostImagePlacements(
  postId: string,
  distinctImageIds: readonly string[],
  query: TransactionQuery,
): Promise<void> {
  const batchSize = getMediaDeliverySafetyWorkLimit('recovery_page_size')
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch UPDATE retires removed attachments for this post
    // no-mistakes-disable-next-line query-reached-per-item: batched UPDATE retiring removed post image placements in DynamicConfig recovery_page_size pages (hard max 1000)
    const { rowCount } = await query(
      sql`/* syncPostImagePlacements:retireAbsent */
      WITH target AS (
        SELECT placement.id
        FROM image_placements image_placement
        JOIN media_placements placement ON placement.id = image_placement.placement_id
        WHERE image_placement.post_id = ${postId}
          AND placement.retirement_reason IS DISTINCT FROM 'owner_removed'
          AND NOT (image_placement.image_id = ANY(${distinctImageIds}::uuid[]))
        ORDER BY placement.id
        LIMIT ${batchSize}
      )
      UPDATE media_placements placement
      SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
          retirement_reason = 'owner_removed',
          revision = placement.revision + 1
      FROM target
      WHERE placement.id = target.id
    `,
    )
    // oxlint-enable no-await-in-loop
    if ((rowCount ?? 0) < batchSize) break
  }
}
