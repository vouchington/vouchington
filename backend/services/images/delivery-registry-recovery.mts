import { beginTransaction } from '@data-stores/psql'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { processMediaDeliveryRegistryRecord } from './delivery-registry-process.mts'
import {
  stageImagePlacementDeliveryRecord,
  stageLegacyImageDeliveryRecord,
} from './delivery-registry-staging.mts'

/** Repairs a pre-commit edge deny after the owning PostgreSQL mutation rolls back. */
export async function compensateFailedImageDeliveryMutation(input: {
  postIds?: string[]
  imageIds?: string[]
}): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  await using transaction = await beginTransaction()
  const recoveryKeys: string[] = []
  const postIds = [...new Set(input.postIds ?? [])]
  const imageIds = [...new Set(input.imageIds ?? [])]
  await lockImageDeliveryMutation(transaction, { postIds, imageIds })
  const { rows: placements } = await transaction<{
    placement_id: string
    revision: number
    image_id: string
  }>(sql`/* compensateFailedImageDeliveryMutation:placements */
    SELECT placement.id AS placement_id, placement.revision, binding.image_id
    FROM media_placements placement
    JOIN image_placements binding ON binding.placement_id = placement.id
    JOIN images image ON image.id = binding.image_id
    JOIN posts post ON post.id = binding.post_id
    WHERE placement.retired_at IS NULL AND placement.copyright_withheld_at IS NULL
      AND image.deleted_at IS NULL AND image.quarantine_pending_at IS NULL
      AND image.openai_omni_moderation_flagged IS NOT TRUE AND post.deleted_at IS NULL
      AND (binding.post_id = ANY(${postIds}::uuid[]) OR binding.image_id = ANY(${imageIds}::uuid[]))
      AND NOT EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
        WHERE target.placement_key = concat('image-placement:', placement.id)
          AND restriction.lifted_at IS NULL
      )
    FOR UPDATE OF placement
  `)
  for (const placement of placements) {
    // oxlint-disable-next-line no-await-in-loop -- each exact revision has an independent outbox identity.
    const staged = await stageImagePlacementDeliveryRecord(
      {
        placementId: placement.placement_id,
        revision: placement.revision,
        imageId: placement.image_id,
        state: 'allow',
      },
      { query: transaction },
    )
    recoveryKeys.push(staged.deliveryKey)
  }
  const { rows: legacyImages } = await transaction<{ image_id: string }>(sql`
    /* compensateFailedImageDeliveryMutation:legacy */
    SELECT image.id AS image_id FROM images image
    WHERE image.id = ANY(${imageIds}::uuid[]) AND image.deleted_at IS NULL
      AND image.upload_completed_at IS NOT NULL AND image.quarantine_pending_at IS NULL
      AND image.openai_omni_moderation_flagged IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM post_images attachment WHERE attachment.image_id = image.id)
    FOR UPDATE
  `)
  for (const image of legacyImages) {
    // oxlint-disable-next-line no-await-in-loop -- generic aliases have separate outbox identities.
    const staged = await stageLegacyImageDeliveryRecord(image.image_id, 'allow', {
      query: transaction,
    })
    recoveryKeys.push(staged.deliveryKey)
  }
  await transaction.commit()
  for (const deliveryKey of recoveryKeys) {
    // oxlint-disable-next-line no-await-in-loop -- each record has an independent bounded retry lease.
    await processMediaDeliveryRegistryRecord(deliveryKey)
  }
}
