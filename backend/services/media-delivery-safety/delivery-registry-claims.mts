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
  deliveryKey: string,
  now = new Date(),
): Promise<MediaDeliveryClaim | null> {
  const statement = sql`/* claimMediaDeliveryProjection */
    WITH candidate AS (
      SELECT work.delivery_key FROM media_delivery_registry_projection_work_items work
      JOIN media_delivery_registry_records record USING (delivery_key)
      WHERE work.delivery_key = ${deliveryKey} AND work.generation = record.generation AND `
  statement.append(mediaDeliveryClaimable(now)).append(sql` FOR UPDATE OF work
    ), claimed AS (
      UPDATE media_delivery_registry_projection_work_items work
      SET lease_token = ${randomUUID()}::uuid, leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + ${MEDIA_DELIVERY_CLAIM_TIMEOUT_MS} * interval '1 millisecond',
        attempt_count = attempt_count + 1
      FROM candidate WHERE work.delivery_key = candidate.delivery_key
      RETURNING work.*
    ), history AS (
      INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type, claimed_at, delivery_attempt_count)
      SELECT delivery_key, generation, 'claimed', leased_at, attempt_count FROM claimed
    ) SELECT record.delivery_key, record.desired_state, record.placement_id,
      record.placement_revision, record.image_id, record.generation, claimed.lease_token
      FROM claimed JOIN media_delivery_registry_records record USING (delivery_key)
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
    WHERE delivery_key = ${claim.delivery_key} AND generation = ${claim.generation}
      AND lease_token = ${claim.lease_token}::uuid AND lease_expires_at > clock_timestamp()
    FOR UPDATE
  `)
  return rows.length === 1
}
