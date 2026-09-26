import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { imageDeliveryAuthorityProof, imageDeliveryIsAuthorized } from './delivery-authority.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import type { ImageDeliveryRecord } from './delivery-registry-types.mts'

export async function replayFailedMediaDeliveryRegistryRecords(input?: {
  actorUserId?: string
  deliveryKeys?: readonly string[]
}): Promise<number> {
  if (input?.deliveryKeys?.length === 0) return 0
  observeSharedDbScope(
    'replayFailedMediaDeliveryRegistryRecords',
    sharedDbIdsScope(input?.deliveryKeys),
  )
  const deliveryKeys = input?.deliveryKeys ? [...input.deliveryKeys] : null
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ delivery_key: string; placement_id: string }>(sql`
    /* replayFailedMediaDeliveryRegistryRecords */
    UPDATE media_delivery_registry_records
    SET state = 'pending', delivery_attempt_count = 0, claimed_at = NULL, completed_at = NULL,
      next_attempt_at = NULL, failure_message = 'Reopened by media delivery reconciliation.'
    WHERE state = 'failed'
      AND (${deliveryKeys}::text[] IS NULL OR delivery_key = ANY(${deliveryKeys}::text[]))
    RETURNING delivery_key, placement_id
  `)
  if (input?.actorUserId) {
    for (const record of rows) {
      // oxlint-disable-next-line no-await-in-loop -- each case receives immutable operator evidence.
      await transaction(sql`/* replayFailedMediaDeliveryRegistryRecords:event */
        INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
        SELECT target.copyright_notice_id, 'media_delivery_registry_replayed', ${input.actorUserId},
          ${JSON.stringify({ deliveryKey: record.delivery_key, reason: 'operator_replay' })}::jsonb
        FROM copyright_notice_targets target
        WHERE ${record.placement_id}::uuid IS NOT NULL
          AND target.placement_key = concat('image-placement:', ${record.placement_id}::uuid)
      `)
    }
  }
  await transaction.commit()
  return rows.length
}

export async function stageCurrentImagePlacementDeliveryRecordsForImageIds(
  imageIds: readonly string[],
): Promise<number> {
  if (imageIds.length === 0) return 0
  return stageAllCurrentImagePlacementDeliveryRecords(imageIds)
}

/** Snapshot staging is advisory; the publisher repeats this same proof under retained locks. */
export async function stageAllCurrentImagePlacementDeliveryRecords(
  imageIds?: readonly string[],
): Promise<number> {
  if (imageIds?.length === 0) return 0
  observeSharedDbScope('stageAllCurrentImagePlacementDeliveryRecords', sharedDbIdsScope(imageIds))
  const imageIdScope = imageIds ? [...imageIds] : null
  const statement = sql`/* stageAllCurrentImagePlacementDeliveryRecords */
    WITH candidates AS (
      SELECT delivery_key, placement_id, placement_revision, image_id
      FROM media_delivery_registry_records
      WHERE (${imageIdScope}::uuid[] IS NULL OR image_id = ANY(${imageIdScope}::uuid[]))
      UNION
      SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', binding.image_id),
        placement.id, placement.revision, binding.image_id
      FROM media_placements placement
      JOIN (SELECT placement_id, image_id FROM image_placements
        UNION ALL SELECT placement_id, image_id FROM image_surface_placements) binding
        ON binding.placement_id = placement.id
      WHERE placement.retired_at IS NULL
        AND (${imageIdScope}::uuid[] IS NULL OR binding.image_id = ANY(${imageIdScope}::uuid[]))
    ), intended AS (
      SELECT authority.*, CASE WHEN `
  statement.append(imageDeliveryAuthorityProof())
  statement.append(sql` THEN 'allow' ELSE 'withheld' END AS desired_state
      FROM candidates authority
    ) SELECT intended.* FROM intended
      LEFT JOIN media_delivery_registry_records existing USING (delivery_key)
      WHERE existing.delivery_key IS NULL OR existing.desired_state IS DISTINCT FROM intended.desired_state
      ORDER BY intended.delivery_key LIMIT 1000
  `)
  const { rows } = await read<Omit<ImageDeliveryRecord, 'generation'>>(statement)
  for (const record of rows) {
    // oxlint-disable-next-line no-await-in-loop -- one retained authority/registry domain per transaction.
    await stageCurrentDeliveryRecord(record)
  }
  return rows.length
}

async function stageCurrentDeliveryRecord(
  record: Omit<ImageDeliveryRecord, 'generation'>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await lockImageDeliveryMutation(transaction, {
    placementIds: [record.placement_id],
    placementOnly: true,
  })
  const state = (await imageDeliveryIsAuthorized(transaction, record)) ? 'allow' : 'withheld'
  await stageImagePlacementDeliveryRecord(
    {
      placementId: record.placement_id,
      revision: record.placement_revision,
      imageId: record.image_id,
      state,
    },
    { query: transaction },
  )
  await transaction.commit()
}
