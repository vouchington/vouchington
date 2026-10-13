import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestMediaDeliveryTransitionHistory(mediaDeliveryRegistryRecordId: string) {
  const { rows } = await read<{
    generation: string
    desired_state: 'allow' | 'withheld'
    change_type: 'pending' | 'claimed' | 'completed' | 'failed'
  }>(sql`/* getTestMediaDeliveryTransitionHistory */
    SELECT generation, desired_state, change_type FROM media_delivery_registry_changes
    WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId} ORDER BY id
  `)
  return rows
}

export async function getTestMediaDeliveryRecordSnapshot(
  mediaDeliveryRegistryRecordId: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await read<{ snapshot: Record<string, unknown> }>(sql`
    /* getTestMediaDeliveryRecordSnapshot */
    SELECT to_jsonb(record) AS snapshot
    FROM view_media_delivery_registry_current_records record WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId}
  `)
  return rows[0]?.snapshot ?? null
}

export async function scheduleTestMediaDeliveryRetry(
  mediaDeliveryRegistryRecordId: string,
  nextAttemptAt: Date,
): Promise<void> {
  const { rowCount } = await write(sql`/* scheduleTestMediaDeliveryRetry */
    INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, delivery_attempt_count, next_attempt_at)
    SELECT media_delivery_registry_record_id, generation, 'pending', 3, ${nextAttemptAt} FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId}
  `)
  if (rowCount !== 1)
    throw new Error(`Missing test delivery record ${mediaDeliveryRegistryRecordId}`)
}
