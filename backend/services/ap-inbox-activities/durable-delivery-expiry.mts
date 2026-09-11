import { write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  ACTIVITYPUB_INBOX_STORAGE_POLICY,
  type ActivityPubInboxStorageSnapshot,
} from '@modules/activitypub-inbox-storage-policy'

export type ActivityPubInboxExpiryCategory = 'unverified' | 'verified-operational'

export type ActivityPubInboxExpiryBatch = {
  deletedRows: number
  deletedRawBodyBytes: number
}

export function buildExpireActivityPubInboxDeliveriesQuery(
  category: ActivityPubInboxExpiryCategory,
  limit: number = ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
): SQLStatement {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize
  ) {
    throw new Error(
      `ActivityPub inbox cleanup limit must be an integer from 1 to ${ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize}`,
    )
  }
  const query = sql`/* expireActivityPubInboxDeliveries */
    WITH candidates AS (
      SELECT delivery.id
      FROM ap_inbox_deliveries delivery
      WHERE delivery.retention_expires_at <= CURRENT_TIMESTAMP
        AND `
  query.append(
    category === 'unverified'
      ? sql`delivery.verified_at IS NULL`
      : sql`delivery.verified_at IS NOT NULL`,
  )
  query.append(sql`
        AND (
          delivery.failed_at IS NOT NULL
          OR delivery.processing_at IS NULL
          OR delivery.processing_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
        )
      ORDER BY delivery.retention_expires_at, delivery.id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    ), deleted AS (
      DELETE FROM ap_inbox_deliveries delivery
      USING candidates
      WHERE delivery.id = candidates.id
      RETURNING OCTET_LENGTH(delivery.raw_body) AS raw_body_bytes
    )
    SELECT COUNT(*)::INTEGER AS deleted_rows,
           COALESCE(SUM(raw_body_bytes), 0)::BIGINT AS deleted_raw_body_bytes
    FROM deleted`)
  return query
}

export async function expireActivityPubInboxDeliveries(
  category: ActivityPubInboxExpiryCategory,
  limit: number = ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
): Promise<ActivityPubInboxExpiryBatch> {
  const { rows } = await write<{
    deleted_rows: number
    deleted_raw_body_bytes: string | number
  }>(buildExpireActivityPubInboxDeliveriesQuery(category, limit))
  const row = rows[0]
  return {
    deletedRows: row?.deleted_rows ?? 0,
    deletedRawBodyBytes: Number(row?.deleted_raw_body_bytes ?? 0),
  }
}

export async function getActivityPubInboxStorageSnapshot(): Promise<ActivityPubInboxStorageSnapshot> {
  const { rows } = await write<{
    retained_rows: string | number
    retained_raw_body_bytes: string | number
    unverified_rows: string | number
    unverified_raw_body_bytes: string | number
  }>(sql`/* getActivityPubInboxStorageSnapshot */
    SELECT retained_rows, retained_raw_body_bytes, unverified_rows, unverified_raw_body_bytes
    FROM ap_inbox_delivery_storage_counters
    WHERE singleton
  `)
  const row = rows[0]
  if (!row) throw new Error('ActivityPub inbox storage counter singleton is missing')
  return {
    retainedRows: Number(row.retained_rows),
    retainedRawBodyBytes: Number(row.retained_raw_body_bytes),
    unverifiedRows: Number(row.unverified_rows),
    unverifiedRawBodyBytes: Number(row.unverified_raw_body_bytes),
  }
}
