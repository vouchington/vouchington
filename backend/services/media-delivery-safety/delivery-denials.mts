import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import {
  publishImagePlacementDeliveryRecord,
  publishLegacyImageDeliveryRecord,
} from './delivery-registry-publish.mts'

export async function prepublishImagePlacementDenials(
  input: { postId?: string; imageId?: string; retainImageIds?: string[] },
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  if (!options.query) {
    await using transaction = await beginTransaction()
    await prepublishImagePlacementDenials(input, { query: transaction })
    await transaction.commit()
    return
  }
  const query = options.query
  await lockImageDeliveryMutation(query, {
    postIds: input.postId ? [input.postId] : [],
    imageIds: input.imageId ? [input.imageId] : [],
  })
  const { rows } = await query<{ placement_id: string; revision: number; image_id: string }>(sql`
    /* prepublishImagePlacementDenials */
    SELECT placement.id AS placement_id, placement.revision, binding.image_id
    FROM media_placements placement
    JOIN (
      SELECT placement_id, image_id, post_id FROM image_placements
      UNION ALL SELECT placement_id, image_id, NULL::uuid AS post_id FROM image_surface_placements
    ) binding ON binding.placement_id = placement.id
    WHERE placement.retired_at IS NULL
      AND (${input.postId ?? null}::uuid IS NULL OR binding.post_id = ${input.postId ?? null}::uuid)
      AND (${input.imageId ?? null}::uuid IS NULL OR binding.image_id = ${input.imageId ?? null}::uuid)
      AND NOT (binding.image_id = ANY(${input.retainImageIds ?? []}::uuid[]))
    ORDER BY placement.id FOR UPDATE OF placement
  `)
  for (const row of rows) {
    // oxlint-disable-next-line no-await-in-loop -- each prior tuple is denied before retirement.
    await publishImagePlacementDeliveryRecord(
      {
        placementId: row.placement_id,
        revision: row.revision,
        imageId: row.image_id,
        state: 'withheld',
      },
      { query },
    )
  }
}

/** Denies every externally routable form before the owner's safety mutation. */
export async function prepublishImageDeliveryDenials(
  imageId: string,
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  if (!options.query) {
    await using transaction = await beginTransaction()
    await prepublishImageDeliveryDenials(imageId, { query: transaction })
    await transaction.commit()
    return
  }
  await prepublishImagePlacementDenials({ imageId }, options)
  await publishLegacyImageDeliveryRecord(imageId, 'withheld', options)
}
