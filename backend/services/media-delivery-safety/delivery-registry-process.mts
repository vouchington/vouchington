import { beginTransaction, write } from '@data-stores/psql'
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
  } catch (error) {
    await failMediaDeliveryRegistryRecord(
      record.delivery_key,
      record.generation,
      now,
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

async function claimMediaDeliveryRegistryRecord(
  deliveryKey: string,
  now: Date,
): Promise<ImageDeliveryRecord | null> {
  await using transaction = await beginTransaction()
  const statement = sql`/* claimMediaDeliveryRegistryRecord */
    WITH candidate AS (
      SELECT delivery_key FROM media_delivery_registry_records
      WHERE delivery_key = ${deliveryKey}
        AND `
  statement.append(mediaDeliveryClaimable(now))
  statement.append(sql`
      FOR UPDATE SKIP LOCKED
    )
    UPDATE media_delivery_registry_records record
    SET state = 'claimed', claimed_at = ${now}, next_attempt_at = NULL,
      delivery_attempt_count = record.delivery_attempt_count + 1, failure_message = NULL
    FROM candidate
    WHERE record.delivery_key = candidate.delivery_key
    RETURNING record.delivery_key, record.desired_state, record.placement_id, record.placement_revision,
      record.image_id, record.generation, COALESCE((
        SELECT string_agg(denied.country_code, ',' ORDER BY denied.country_code)
        FROM media_delivery_registry_denied_countries denied
        WHERE denied.delivery_key = record.delivery_key
      ), '') AS denied_country_codes
  `)
  const { rows } = await transaction<ImageDeliveryRecord>(statement)
  await transaction.commit()
  return rows[0] ?? null
}

async function failMediaDeliveryRegistryRecord(
  deliveryKey: string,
  generation: string,
  now: Date,
  failureMessage: string,
): Promise<void> {
  await write(sql`/* failMediaDeliveryRegistryRecord */
    UPDATE media_delivery_registry_records
    SET state = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
      claimed_at = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN claimed_at ELSE NULL END,
      completed_at = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS}
        THEN ${now} ELSE NULL::timestamptz END,
      next_attempt_at = CASE WHEN delivery_attempt_count >= ${MAX_ATTEMPTS} THEN NULL::timestamptz
        ELSE ${new Date(now.getTime() + RETRY_BASE_MS)} END,
      failure_message = ${failureMessage.slice(0, 4096)}
    WHERE delivery_key = ${deliveryKey} AND state = 'claimed' AND generation = ${generation}
  `)
}
