import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestMediaDeliveryRecordSnapshot(
  deliveryKey: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await read<{ snapshot: Record<string, unknown> }>(sql`
    /* getTestMediaDeliveryRecordSnapshot */
    SELECT to_jsonb(record) AS snapshot
    FROM media_delivery_registry_current_records record WHERE delivery_key = ${deliveryKey}
  `)
  return rows[0]?.snapshot ?? null
}

export async function scheduleTestMediaDeliveryRetry(
  deliveryKey: string,
  nextAttemptAt: Date,
): Promise<void> {
  const { rowCount } = await write(sql`/* scheduleTestMediaDeliveryRetry */
    INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type, delivery_attempt_count, next_attempt_at)
    SELECT delivery_key, generation, 'pending', 3, ${nextAttemptAt} FROM media_delivery_registry_current_records
    WHERE delivery_key = ${deliveryKey}
  `)
  if (rowCount !== 1) throw new Error(`Missing test delivery record ${deliveryKey}`)
}
