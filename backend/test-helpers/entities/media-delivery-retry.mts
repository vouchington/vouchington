import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestMediaDeliveryRecordSnapshot(
  deliveryKey: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await read<{ snapshot: Record<string, unknown> }>(sql`
    /* getTestMediaDeliveryRecordSnapshot */
    SELECT to_jsonb(record) AS snapshot
    FROM media_delivery_registry_records record WHERE delivery_key = ${deliveryKey}
  `)
  return rows[0]?.snapshot ?? null
}

export async function scheduleTestMediaDeliveryRetry(
  deliveryKey: string,
  nextAttemptAt: Date,
): Promise<void> {
  const { rowCount } = await write(sql`/* scheduleTestMediaDeliveryRetry */
    UPDATE media_delivery_registry_records
    SET state = 'pending', claimed_at = NULL, completed_at = NULL,
      delivery_attempt_count = 3, next_attempt_at = ${nextAttemptAt}
    WHERE delivery_key = ${deliveryKey}
  `)
  if (rowCount !== 1) throw new Error(`Missing test delivery record ${deliveryKey}`)
}
