import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { imageDeliveryAuthorityProof, imageDeliveryIsAuthorized } from './delivery-authority.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import {
  stageImagePlacementDeliveryRecord,
  stageLegacyImageDeliveryRecord,
} from './delivery-registry-staging.mts'
import type { ImageDeliveryRecord } from './delivery-registry-types.mts'

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

export async function replayFailedMediaDeliveryRegistryRecords(input?: {
  actorUserId?: string
}): Promise<number> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ delivery_key: string; placement_id: string | null }>(sql`
    /* replayFailedMediaDeliveryRegistryRecords */
    UPDATE media_delivery_registry_records
    SET state = 'pending', delivery_attempt_count = 0, claimed_at = NULL, completed_at = NULL,
      next_attempt_at = NULL, failure_message = 'Reopened by media delivery reconciliation.'
    WHERE state = 'failed' RETURNING delivery_key, placement_id
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

export async function listRecoverableMediaDeliveryRegistryKeys(
  limit: number,
  now: Date,
): Promise<string[]> {
  const { rows } = await read<{
    delivery_key: string
  }>(sql`/* listRecoverableMediaDeliveryRegistryKeys */
    SELECT delivery_key FROM media_delivery_registry_records
    WHERE (state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}))
      OR (state = 'claimed' AND claimed_at <= ${new Date(now.getTime() - CLAIM_TIMEOUT_MS)})
    ORDER BY COALESCE(next_attempt_at, claimed_at, created_at), delivery_key LIMIT ${limit}
  `)
  return rows.map(row => row.delivery_key)
}

/** Snapshot staging is advisory; the publisher repeats this same proof under retained locks. */
export async function stageAllCurrentImagePlacementDeliveryRecords(): Promise<number> {
  const statement = sql`/* stageAllCurrentImagePlacementDeliveryRecords */
    WITH candidates AS (
      SELECT delivery_key, route_kind, placement_id, placement_revision, asset_id
      FROM media_delivery_registry_records
      UNION
      SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', binding.image_id),
        'placement', placement.id, placement.revision, binding.image_id
      FROM media_placements placement
      JOIN (SELECT placement_id, image_id FROM image_placements
        UNION ALL SELECT placement_id, image_id FROM image_surface_placements) binding
        ON binding.placement_id = placement.id
      WHERE placement.retired_at IS NULL
      UNION
      SELECT concat('legacy-image:', image.id), 'legacy-image', NULL::uuid, NULL::integer, image.id
      FROM images image
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
    placementIds: record.placement_id ? [record.placement_id] : [],
    placementOnly: record.route_kind === 'placement',
    imageIds: record.route_kind === 'legacy-image' ? [record.asset_id] : [],
  })
  const state = (await imageDeliveryIsAuthorized(transaction, record)) ? 'allow' : 'withheld'
  if (record.route_kind === 'legacy-image')
    await stageLegacyImageDeliveryRecord(record.asset_id, state, { query: transaction })
  else
    await stageImagePlacementDeliveryRecord(
      {
        placementId: record.placement_id!,
        revision: record.placement_revision!,
        imageId: record.asset_id,
        state,
      },
      { query: transaction },
    )
  await transaction.commit()
}
