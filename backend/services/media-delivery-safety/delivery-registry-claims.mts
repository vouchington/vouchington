import { randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ImageDeliveryRecord } from './delivery-registry-types.mts'
import {
  MEDIA_DELIVERY_CLAIM_TIMEOUT_MS,
  mediaDeliveryClaimable,
} from './delivery-registry-policy.mts'

export type MediaDeliveryClaim = ImageDeliveryRecord & { lease_token: string }

/** Callers retain the authority lock before claiming or publishing this exact generation. */
export async function claimMediaDeliveryProjection(
  query: QueryExecutor,
  mediaDeliveryRegistryRecordId: string,
  now = new Date(),
): Promise<MediaDeliveryClaim | null> {
  const statement = sql`/* claimMediaDeliveryProjection */
    WITH candidate AS (
      SELECT work.media_delivery_registry_record_id FROM media_delivery_registry_projection_work_items work
      JOIN media_delivery_registry_records record ON record.id = work.media_delivery_registry_record_id
      WHERE work.media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId} AND work.generation = record.generation AND `
  statement.append(mediaDeliveryClaimable(now)).append(sql` FOR UPDATE OF work
    ), claimed AS (
      UPDATE media_delivery_registry_projection_work_items work
      SET lease_token = ${randomUUID()}::uuid, leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + ${MEDIA_DELIVERY_CLAIM_TIMEOUT_MS} * interval '1 millisecond',
        attempt_count = attempt_count + 1
      FROM candidate WHERE work.media_delivery_registry_record_id = candidate.media_delivery_registry_record_id
      RETURNING work.*
    ), history AS (
      INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, claimed_at, delivery_attempt_count)
      SELECT media_delivery_registry_record_id, generation, 'claimed', leased_at, attempt_count FROM claimed
    ) SELECT record.id AS media_delivery_registry_record_id, record.desired_state, record.placement_id,
      record.placement_revision, record.image_id, record.generation, claimed.lease_token
      FROM claimed JOIN media_delivery_registry_records record ON record.id = claimed.media_delivery_registry_record_id
  `)
  const { rows } = await query<MediaDeliveryClaim>(statement)
  return rows[0] ?? null
}

export async function ownsMediaDeliveryProjection(
  query: QueryExecutor,
  claim: MediaDeliveryClaim,
): Promise<boolean> {
  const { rows } = await query(sql`/* ownsMediaDeliveryProjection */
    SELECT 1 FROM media_delivery_registry_projection_work_items
    WHERE media_delivery_registry_record_id = ${claim.media_delivery_registry_record_id} AND generation = ${claim.generation}
      AND lease_token = ${claim.lease_token}::uuid AND lease_expires_at > clock_timestamp()
    FOR UPDATE
  `)
  return rows.length === 1
}
