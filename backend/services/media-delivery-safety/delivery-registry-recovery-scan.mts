import {
  getMediaDeliverySafetyWorkLimit,
  mediaDeliverySafetyWorkMaxValues,
} from './work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'
import {
  observeSharedDbScope,
  sharedDbCursorScope,
  sharedDbIdsScope,
} from '@data-stores/psql/shared-db-scope-observer'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { MEDIA_DELIVERY_MAX_ATTEMPTS, mediaDeliveryClaimable } from './delivery-registry-policy.mts'

/** The primary database owns exact cutoff precision and read-after-write visibility. */
export async function getMediaDeliveryRegistryScanBefore(): Promise<string> {
  const { rows } = await write<{ scan_before: string }>(sql`
    /* getMediaDeliveryRegistryScanBefore */ SELECT CURRENT_TIMESTAMP::text AS scan_before
  `)
  return rows[0]!.scan_before
}

export async function failExpiredExhaustedMediaDeliveryRegistryRecords(
  now: string,
  recordIds?: readonly string[],
): Promise<number> {
  const MEDIA_DELIVERY_RECOVERY_PAGE_SIZE = getMediaDeliverySafetyWorkLimit('recovery_page_size')
  if (recordIds?.length === 0) return 0
  await using transaction = await beginTransaction()
  const { rows: candidates } = await transaction<{
    media_delivery_registry_record_id: string
  }>(sql`/* failExpiredExhaustedMediaDeliveryRegistryRecords:lock */
    SELECT record.id AS media_delivery_registry_record_id FROM media_delivery_registry_records record
    JOIN media_delivery_registry_projection_work_items current ON current.media_delivery_registry_record_id = record.id
    WHERE current.lease_token IS NOT NULL AND current.attempt_count >= ${MEDIA_DELIVERY_MAX_ATTEMPTS}
      AND (${recordIds ?? null}::uuid[] IS NULL OR record.id = ANY(${recordIds ?? null}::uuid[]))
      AND current.lease_expires_at <= ${now}::timestamptz
    ORDER BY record.id LIMIT ${MEDIA_DELIVERY_RECOVERY_PAGE_SIZE} FOR UPDATE OF record SKIP LOCKED
  `)
  const { rowCount } = await transaction(sql`/* failExpiredExhaustedMediaDeliveryRegistryRecords */
    INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, delivery_attempt_count, claimed_at, completed_at, failure_message)
    SELECT media_delivery_registry_record_id, generation, 'failed', attempt_count, leased_at, ${now}::timestamptz,
      'Final media delivery claim expired before publication completed. Operator replay required.'
    FROM media_delivery_registry_projection_work_items
    WHERE media_delivery_registry_record_id = ANY(${candidates.map(row => row.media_delivery_registry_record_id)}::uuid[])
      AND lease_token IS NOT NULL AND attempt_count >= ${MEDIA_DELIVERY_MAX_ATTEMPTS}
      AND lease_expires_at <= ${now}::timestamptz
  `)
  await transaction.commit()
  return rowCount ?? 0
}

export async function listRecoverableMediaDeliveryRegistryIds(input: {
  limit: number
  scanBefore: string
  after?: string
  recordIds?: readonly string[]
}): Promise<{ results: string[]; page_info: PageInfo }> {
  // The caller captures its configured budget before awaits; only the stable hard ceiling applies here.
  const pageMaximum = mediaDeliverySafetyWorkMaxValues.recovery_page_size
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > pageMaximum)
    throw new TypeError('Media recovery page limit must be between one and the page maximum')
  const recordIds = input.recordIds ? [...new Set(input.recordIds)].toSorted() : null
  const scope = JSON.stringify({
    scanBefore: input.scanBefore,
    order: 'media-delivery-registry-record-id-asc',
    recordIds,
  })
  const after = input.after
    ? decodeScopedUuidCursor(input.after, scope, 'Invalid media recovery cursor').id
    : null
  if (recordIds?.length === 0)
    return {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
  observeSharedDbScope(
    'listRecoverableMediaDeliveryRegistryIds',
    recordIds ? sharedDbIdsScope(recordIds) : sharedDbCursorScope(after),
  )
  const statement = sql`/* listRecoverableMediaDeliveryRegistryIds */
    SELECT work.media_delivery_registry_record_id FROM media_delivery_registry_projection_work_items work
    JOIN media_delivery_registry_records record ON record.id = work.media_delivery_registry_record_id
    WHERE work.media_delivery_registry_record_id < ${timestampToUuidv7LowerBound(new Date(input.scanBefore).getTime() + 1)}::uuid
      AND (${recordIds}::uuid[] IS NULL OR work.media_delivery_registry_record_id = ANY(${recordIds}::uuid[]))
      AND (${after}::uuid IS NULL OR work.media_delivery_registry_record_id > ${after}) AND `
  statement.append(mediaDeliveryClaimable(input.scanBefore))
  statement.append(sql` ORDER BY work.media_delivery_registry_record_id LIMIT ${input.limit + 1}`)
  const { rows } = await write<{ media_delivery_registry_record_id: string }>(statement)
  const results = rows.slice(0, input.limit).map(row => row.media_delivery_registry_record_id)
  const encode = (alias: string) => encodeScopedUuidCursor(alias, scope)
  return {
    results,
    page_info: {
      has_next_page: rows.length > input.limit,
      start_cursor: results.length ? encode(results[0]!) : null,
      end_cursor: results.length ? encode(results.at(-1)!) : null,
    },
  }
}
