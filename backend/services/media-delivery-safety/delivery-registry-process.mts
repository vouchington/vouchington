import { beginTransaction } from '@data-stores/psql'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import type { ImageDeliveryRecord, MediaDeliveryDependencies } from './delivery-registry-types.mts'
import { publishStagedMediaDeliveryRecord } from './delivery-registry-publish.mts'

import {
  MEDIA_DELIVERY_MAX_ATTEMPTS as MAX_ATTEMPTS,
  MEDIA_DELIVERY_RETRY_MS as RETRY_BASE_MS,
  mediaDeliveryClaimable,
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
    await publishStagedMediaDeliveryRecord(record.delivery_key, { dependencies })
    return 'completed'
  } catch (err) {
    await failMediaDeliveryRegistryRecord(
      record.delivery_key,
      record.generation,
      now,
      err instanceof Error ? err.message : String(err),
    )
    throw err
  }
}

async function claimMediaDeliveryRegistryRecord(
  deliveryKey: string,
  now: Date,
): Promise<ImageDeliveryRecord | null> {
  await using transaction = await beginTransaction()
  const { rows: locked } = await transaction(sql`/* claimMediaDeliveryRegistryRecord:lock */
    SELECT delivery_key FROM media_delivery_registry_records
    WHERE delivery_key = ${deliveryKey} FOR UPDATE SKIP LOCKED
  `)
  if (!locked.length) {
    await transaction.commit()
    return null
  }
  const statement = sql`/* claimMediaDeliveryRegistryRecord */
    INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type,
      claimed_at, delivery_attempt_count)
    SELECT delivery_key, generation, 'claimed', ${now}, delivery_attempt_count + 1
    FROM media_delivery_registry_current_records WHERE delivery_key = ${deliveryKey} AND `
  statement.append(mediaDeliveryClaimable(now)).append(sql`
    RETURNING delivery_key
  `)
  const { rows: claimed } = await transaction(statement)
  const { rows } = claimed.length
    ? await transaction<ImageDeliveryRecord>(sql`
    SELECT delivery_key, desired_state, placement_id, placement_revision, image_id, generation
    FROM media_delivery_registry_records WHERE delivery_key = ${deliveryKey}
  `)
    : { rows: [] }
  await transaction.commit()
  return rows[0] ?? null
}

async function failMediaDeliveryRegistryRecord(
  deliveryKey: string,
  generation: string,
  now: Date,
  failureMessage: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* failMediaDeliveryRegistryRecord:lock */
    SELECT delivery_key FROM media_delivery_registry_records WHERE delivery_key = ${deliveryKey} FOR UPDATE
  `)
  await transaction(sql`/* failMediaDeliveryRegistryRecord */
    INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type,
      delivery_attempt_count, claimed_at, completed_at, next_attempt_at, failure_message)
    SELECT delivery_key, generation,
      CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN 'failed'::media_delivery_registry_change_types ELSE 'pending'::media_delivery_registry_change_types END,
      delivery_attempt_count,
      CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN claimed_at ELSE NULL END,
      CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN ${now} ELSE NULL::timestamptz END,
      CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN NULL::timestamptz ELSE ${new Date(now.getTime() + RETRY_BASE_MS)} END,
      ${failureMessage.slice(0, 4096)}
    FROM media_delivery_registry_current_records
    WHERE delivery_key = ${deliveryKey} AND state = 'claimed' AND generation = ${generation}
  `)
  await transaction.commit()
}
