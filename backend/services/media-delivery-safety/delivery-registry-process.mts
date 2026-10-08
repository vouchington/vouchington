import { beginTransaction } from '@data-stores/psql'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import type { MediaDeliveryDependencies } from './delivery-registry-types.mts'
import {
  claimMediaDeliveryProjection,
  type MediaDeliveryClaim,
} from './delivery-registry-claims.mts'
import { publishStagedMediaDeliveryRecord } from './delivery-registry-publish.mts'

import {
  MEDIA_DELIVERY_MAX_ATTEMPTS as MAX_ATTEMPTS,
  MEDIA_DELIVERY_RETRY_MS as RETRY_BASE_MS,
} from './delivery-registry-policy.mts'

export async function processMediaDeliveryRegistryRecord(
  deliveryKey: string,
  now = new Date(),
  dependencies: Partial<MediaDeliveryDependencies> = {},
): Promise<'completed' | 'not_claimed'> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return 'not_claimed'
  const record = await claimMediaDeliveryRegistryRecord(deliveryKey, now)
  if (!record) return 'not_claimed'
  try {
    await publishStagedMediaDeliveryRecord(record.delivery_key, { dependencies, claim: record })
    return 'completed'
  } catch (err) {
    await failMediaDeliveryRegistryRecord(
      record,
      now,
      err instanceof Error ? err.message : String(err),
    )
    throw err
  }
}

async function claimMediaDeliveryRegistryRecord(
  deliveryKey: string,
  now: Date,
): Promise<MediaDeliveryClaim | null> {
  await using transaction = await beginTransaction()
  const { rows: locked } = await transaction(sql`/* claimMediaDeliveryRegistryRecord:lock */
    SELECT delivery_key FROM media_delivery_registry_records
    WHERE delivery_key = ${deliveryKey} FOR UPDATE SKIP LOCKED
  `)
  if (!locked.length) {
    await transaction.commit()
    return null
  }
  const record = await claimMediaDeliveryProjection(transaction, deliveryKey, now)
  await transaction.commit()
  return record
}

async function failMediaDeliveryRegistryRecord(
  claim: MediaDeliveryClaim,
  now: Date,
  failureMessage: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* failMediaDeliveryRegistryRecord:lock */
    SELECT delivery_key FROM media_delivery_registry_records WHERE delivery_key = ${claim.delivery_key} FOR UPDATE
  `)
  await transaction(sql`/* failMediaDeliveryRegistryRecord */
    WITH released AS (
      UPDATE media_delivery_registry_projection_work_items
      SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL,
        available_at = ${new Date(now.getTime() + RETRY_BASE_MS)}
      WHERE delivery_key = ${claim.delivery_key} AND generation = ${claim.generation}
        AND lease_token = ${claim.lease_token}::uuid AND lease_expires_at > clock_timestamp()
      RETURNING delivery_key, generation, attempt_count, available_at
    ) INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type,
      delivery_attempt_count, completed_at, next_attempt_at, failure_message)
    SELECT delivery_key, generation,
      CASE WHEN attempt_count >= ${MAX_ATTEMPTS} THEN 'failed'::media_delivery_registry_change_types ELSE 'pending'::media_delivery_registry_change_types END,
      attempt_count, CASE WHEN attempt_count >= ${MAX_ATTEMPTS} THEN clock_timestamp() ELSE NULL::timestamptz END,
      CASE WHEN attempt_count >= ${MAX_ATTEMPTS} THEN NULL::timestamptz ELSE available_at END,
      ${failureMessage.slice(0, 4096)} FROM released
  `)
  await transaction.commit()
}
