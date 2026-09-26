import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { reconcileDeliveryRepairMarker } from '../../services/media-delivery-safety/delivery-repair-markers.mts'

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
