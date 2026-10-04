import {
  getMediaDeliverySafetyWorkLimit,
  mediaDeliverySafetyWorkMaxValues,
} from './work-limits.mts'
import { write } from '@data-stores/psql'
import {
  observeSharedDbScope,
  sharedDbCursorScope,
  sharedDbIdsScope,
} from '@data-stores/psql/shared-db-scope-observer'
import { decodeScopedAliasCursor, encodeScopedAliasCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import {
  MEDIA_DELIVERY_CLAIM_TIMEOUT_MS,
  MEDIA_DELIVERY_MAX_ATTEMPTS,
  mediaDeliveryClaimable,
} from './delivery-registry-policy.mts'

/** The primary database owns exact cutoff precision and read-after-write visibility. */
export async function getMediaDeliveryRegistryScanBefore(): Promise<string> {
  const { rows } = await write<{ scan_before: string }>(sql`
    /* getMediaDeliveryRegistryScanBefore */ SELECT CURRENT_TIMESTAMP::text AS scan_before
  `)
  return rows[0]!.scan_before
}

export async function failExpiredExhaustedMediaDeliveryRegistryRecords(
  now: string,
  deliveryKeys?: readonly string[],
): Promise<number> {
  const MEDIA_DELIVERY_RECOVERY_PAGE_SIZE = getMediaDeliverySafetyWorkLimit('recovery_page_size')
  if (deliveryKeys?.length === 0) return 0
  const { rowCount } = await write(sql`/* failExpiredExhaustedMediaDeliveryRegistryRecords */
    WITH candidates AS (
      SELECT delivery_key FROM media_delivery_registry_records
      WHERE state = 'claimed' AND delivery_attempt_count >= ${MEDIA_DELIVERY_MAX_ATTEMPTS}
        AND (${deliveryKeys ?? null}::text[] IS NULL OR delivery_key = ANY(${deliveryKeys ?? null}::text[]))
        AND claimed_at <= ${now}::timestamptz
          - ${MEDIA_DELIVERY_CLAIM_TIMEOUT_MS} * interval '1 millisecond'
      ORDER BY delivery_key LIMIT ${MEDIA_DELIVERY_RECOVERY_PAGE_SIZE}
      FOR UPDATE SKIP LOCKED
    ) UPDATE media_delivery_registry_records record
      SET state = 'failed', completed_at = ${now}::timestamptz, next_attempt_at = NULL,
        failure_message = 'Final media delivery claim expired before publication completed. Operator replay required.'
      FROM candidates WHERE record.delivery_key = candidates.delivery_key
        AND record.state = 'claimed' AND record.delivery_attempt_count >= ${MEDIA_DELIVERY_MAX_ATTEMPTS}
        AND record.claimed_at <= ${now}::timestamptz
          - ${MEDIA_DELIVERY_CLAIM_TIMEOUT_MS} * interval '1 millisecond'
  `)
  return rowCount ?? 0
}

export async function listRecoverableMediaDeliveryRegistryKeys(input: {
  limit: number
  scanBefore: string
  after?: string
  deliveryKeys?: readonly string[]
}): Promise<{ results: string[]; page_info: PageInfo }> {
  // The caller captures its configured budget before awaits; only the stable hard ceiling applies here.
  const pageMaximum = mediaDeliverySafetyWorkMaxValues.recovery_page_size
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > pageMaximum)
    throw new TypeError('Media recovery page limit must be between one and the page maximum')
  const deliveryKeys = input.deliveryKeys ? [...new Set(input.deliveryKeys)].toSorted() : null
  const scope = JSON.stringify({
    scanBefore: input.scanBefore,
    order: 'media-delivery-key-asc',
    deliveryKeys,
  })
  const after = input.after
    ? decodeScopedAliasCursor(input.after, scope, 'Invalid media recovery cursor').alias
    : null
  if (deliveryKeys?.length === 0)
    return {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
  observeSharedDbScope(
    'listRecoverableMediaDeliveryRegistryKeys',
    deliveryKeys ? sharedDbIdsScope(deliveryKeys) : sharedDbCursorScope(after),
  )
  const statement = sql`/* listRecoverableMediaDeliveryRegistryKeys */
    SELECT delivery_key FROM media_delivery_registry_records
    WHERE created_at <= ${input.scanBefore}::timestamptz
      AND (${deliveryKeys}::text[] IS NULL OR delivery_key = ANY(${deliveryKeys}::text[]))
      AND (${after}::text IS NULL OR delivery_key > ${after}) AND `
  statement.append(mediaDeliveryClaimable(input.scanBefore))
  statement.append(sql` ORDER BY delivery_key LIMIT ${input.limit + 1}`)
  const { rows } = await write<{ delivery_key: string }>(statement)
  const results = rows.slice(0, input.limit).map(row => row.delivery_key)
  const encode = (alias: string) => encodeScopedAliasCursor(alias, scope)
  return {
    results,
    page_info: {
      has_next_page: rows.length > input.limit,
      start_cursor: results.length ? encode(results[0]!) : null,
      end_cursor: results.length ? encode(results.at(-1)!) : null,
    },
  }
}
