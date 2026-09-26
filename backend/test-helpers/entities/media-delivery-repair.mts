import { read, write, writePool, withTransactionOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { reconcileDeliveryRepairMarker } from '../../services/media-delivery-safety/delivery-repair-markers.mts'

/** Real autocommit executor for rejecting authority calls without a retained transaction. */
export const testDeliveryAutocommitQuery = write

export async function withTestDeliveryBorrowedClient(
  query: TransactionQuery,
  operation: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  await withTransactionOptions({ client: query.client }, operation)
}

export async function withTestDeliveryReusedClient(
  operation: (
    run: (operation: (query: TransactionQuery) => Promise<void>) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  const client = await writePool.connect()
  try {
    await operation(callback => withTransactionOptions({ client }, callback))
  } finally {
    client.release()
  }
}

export async function createTestDeliverySavepoint(query: TransactionQuery): Promise<void> {
  await query(sql`SAVEPOINT delivery_admission_test`)
}

export async function rollbackTestDeliverySavepoint(query: TransactionQuery): Promise<void> {
  // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- verifies savepoint-local guard rewind inside the real transaction owner, not manual transaction lifecycle.
  await query(sql`ROLLBACK TO SAVEPOINT delivery_admission_test`)
}

export async function flagTestDeliveryImageInTransaction(
  query: TransactionQuery,
  imageId: string,
): Promise<void> {
  await query(sql`UPDATE images SET openai_omni_moderation_flagged = TRUE WHERE id = ${imageId}`)
}

export async function setTestDeliveryUserImageInTransaction(
  query: TransactionQuery,
  userId: string,
  imageId: string,
): Promise<void> {
  await query(sql`UPDATE users SET profile_image_id = ${imageId} WHERE id = ${userId}`)
}

export async function testDeliveryTransactionIsBlockingAdmission(pid: number): Promise<boolean> {
  const { rows } = await read<{ blocked: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))
      AND query LIKE '%lockImageAssetAdmission%') AS blocked
  `)
  return rows[0]!.blocked
}

export async function getTestDeliveryRepairMarker(deliveryKey: string): Promise<string | null> {
  const { rows } = await read<{ marker_token: string }>(sql`
    SELECT marker_token FROM media_delivery_repair_markers WHERE delivery_key = ${deliveryKey}
  `)
  return rows[0]?.marker_token ?? null
}

export async function getTestDeliveryTransactionPid(query: TransactionQuery): Promise<number> {
  const { rows } = await query<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
  return rows[0]!.pid
}

export async function testDeliveryTransactionIsWaitingForLock(pid: number): Promise<boolean> {
  const { rows } = await read<{ waiting: boolean }>(sql`
    SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = ${pid}
  `)
  return rows[0]?.waiting ?? false
}

export async function lockTestDeliveryNoticeNowait(
  query: TransactionQuery,
  noticeId: string,
): Promise<void> {
  await query(sql`SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE NOWAIT`)
}

export async function advanceTestDeliveryPlacementRevision(
  query: TransactionQuery,
  placementId: string,
): Promise<number> {
  const { rows } = await query<{ revision: number }>(sql`
    UPDATE media_placements SET revision = revision + 1, copyright_withheld_at = CURRENT_TIMESTAMP
    WHERE id = ${placementId} RETURNING revision
  `)
  return rows[0]!.revision
}

/** Invokes the production exact-marker primitive using only a persisted owned fixture. */
export async function reconcileTestDeliveryRepairMarker(deliveryKey: string): Promise<void> {
  const { rows } = await read<Parameters<typeof reconcileDeliveryRepairMarker>[0]>(sql`
    /* reconcileTestDeliveryRepairMarker */
    SELECT delivery_key, marker_token, route_kind, placement_id, placement_revision, asset_id
    FROM media_delivery_repair_markers WHERE delivery_key = ${deliveryKey}
  `)
  if (!rows[0]) throw new Error('Owned delivery repair marker missing')
  await reconcileDeliveryRepairMarker(rows[0])
}
