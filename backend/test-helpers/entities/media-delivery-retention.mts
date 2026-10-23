import { read, write, type TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'

export async function insertAgedMediaDeliveryTransitionForTest(
  recordId: string,
  generation: string,
  desiredState: 'allow' | 'withheld',
  ageDate: Date,
  completedAt = ageDate,
): Promise<string> {
  const id = v7({ msecs: ageDate.getTime() })
  await write(
    `/* insertAgedMediaDeliveryTransitionForTest */
    INSERT INTO media_delivery_registry_changes
      (id, media_delivery_registry_record_id, generation, change_type, desired_state, completed_at)
    VALUES ($1, $2, $3, 'completed', $4, $5)`,
    [id, recordId, generation, desiredState, completedAt],
  )
  return id
}

export async function updateMediaDeliveryTransitionForTest(id: string): Promise<void> {
  await write(
    `/* updateMediaDeliveryTransitionForTest */
    UPDATE media_delivery_registry_changes SET delivery_attempt_count = 1 WHERE id = $1`,
    [id],
  )
}

export async function setMediaDeliveryDesiredStateForTest(
  recordId: string,
  desiredState: 'allow' | 'withheld',
): Promise<string> {
  const { rows } = await write<{ generation: string }>(
    `/* setMediaDeliveryDesiredStateForTest */
    UPDATE media_delivery_registry_records SET desired_state = $2 WHERE id = $1
    RETURNING generation::text`,
    [recordId, desiredState],
  )
  if (!rows[0]) throw new Error('Missing owned media delivery record')
  return rows[0].generation
}

export async function deleteMediaDeliveryTransitionForTest(id: string): Promise<void> {
  await write(
    `/* deleteMediaDeliveryTransitionForTest */
    DELETE FROM media_delivery_registry_changes WHERE id = $1`,
    [id],
  )
}

export async function mediaDeliveryTransitionExistsForTest(
  id: string,
  query?: TransactionQuery,
): Promise<boolean> {
  const { rows } = await (query ?? read)(
    `/* mediaDeliveryTransitionExistsForTest */
    SELECT 1 FROM media_delivery_registry_changes WHERE id = $1`,
    [id],
  )
  return rows.length > 0
}

export async function resetMediaDeliveryRetentionCursorForTest(
  query: TransactionQuery,
): Promise<void> {
  await query(`/* ensureMediaDeliveryRetentionCursorForTest */
    INSERT INTO media_delivery_change_retention_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  await query(`/* resetMediaDeliveryRetentionCursorForTest */
    UPDATE media_delivery_change_retention_cursors
    SET cursor_id = NULL, sweep_upper_bound_id = NULL WHERE is_singleton`)
}
