import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'
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
  await transaction(sql`/* replayFailedMediaDeliveryRegistryRecords:lock */
    SELECT record.delivery_key FROM media_delivery_registry_records record
    JOIN view_media_delivery_registry_current_records current USING (delivery_key)
    WHERE current.state = 'failed' AND (${deliveryKeys}::text[] IS NULL OR record.delivery_key = ANY(${deliveryKeys}::text[]))
    ORDER BY record.delivery_key FOR UPDATE OF record
  `)
  const { rows } = await transaction<{ delivery_key: string; placement_id: string }>(sql`
    /* replayFailedMediaDeliveryRegistryRecords */
    WITH inserted AS (
      INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type, changed_by_id, failure_message)
      SELECT delivery_key, generation, 'pending', ${input?.actorUserId ?? null}, 'Reopened by media delivery reconciliation.'
      FROM view_media_delivery_registry_current_records
      WHERE state = 'failed' AND (${deliveryKeys}::text[] IS NULL OR delivery_key = ANY(${deliveryKeys}::text[]))
      RETURNING delivery_key
    ) SELECT record.delivery_key, record.placement_id FROM inserted
      JOIN media_delivery_registry_records record USING (delivery_key)
  `)
  if (input?.actorUserId) {
    for (const record of rows) {
      // oxlint-disable-next-line no-await-in-loop -- each case receives immutable operator evidence.
      await transaction(sql`/* replayFailedMediaDeliveryRegistryRecords:event */
        INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
          media_delivery_registry_record_delivery_key, replay_reason)
        SELECT target.copyright_notice_id, 'media_delivery_registry_replayed', ${input.actorUserId},
          ${record.delivery_key}, 'operator_replay'
        FROM copyright_notice_targets target
        WHERE ${record.placement_id}::uuid IS NOT NULL
          AND target.placement_id = ${record.placement_id}::uuid
      `)
    }
  }
  await transaction.commit()
  return rows.length
}

/** @public Scoped reconciliation seam exercised against real PostgreSQL delivery records. */
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
  const WORK_PAGE_SIZE = getMediaDeliverySafetyWorkLimit('registry_reconciliation_page_size')
  if (imageIds?.length === 0) return 0
  observeSharedDbScope('stageAllCurrentImagePlacementDeliveryRecords', sharedDbIdsScope(imageIds))
  const imageIdScope = imageIds ? [...imageIds] : null
  const statement = sql`/* stageAllCurrentImagePlacementDeliveryRecords */
    WITH candidates AS (
      SELECT delivery_key, placement_id, placement_revision, image_id
      FROM view_media_delivery_registry_current_records
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
  statement.append(sql` THEN 'allow'::media_delivery_desired_states ELSE 'withheld'::media_delivery_desired_states END AS desired_state
      FROM candidates authority
    ) SELECT intended.* FROM intended
      LEFT JOIN view_media_delivery_registry_current_records existing USING (delivery_key)
      WHERE existing.delivery_key IS NULL OR existing.desired_state IS DISTINCT FROM intended.desired_state
      ORDER BY intended.delivery_key LIMIT ${WORK_PAGE_SIZE}
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
