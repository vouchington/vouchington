import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { claimMediaDeliveryProjection } from '../services/media-delivery-safety/delivery-registry-claims.mts'

export async function membership(id: string) {
  const { rows } = await write<{
    failed_change_id: string | null
    generation: string
    lease_token: string | null
    attempt_count: number
  }>(sql`/* readDerivedMediaReplayMembership */
    SELECT failed_change_id, generation, lease_token, attempt_count
    FROM media_delivery_registry_projection_work_items WHERE media_delivery_registry_record_id = ${id}::uuid
  `)
  return rows
}

export async function rollbackMediaReplayMembership(id: string) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* rollbackMediaReplayMembershipFixture */
      INSERT INTO media_delivery_registry_changes (media_delivery_registry_record_id, generation, change_type)
      SELECT id, generation, 'pending' FROM media_delivery_registry_records WHERE id = ${id}::uuid
    `)
  const inTransaction = await transaction<{ failed_change_id: string | null }>(sql`
      /* readRolledBackMediaReplayMembership */ SELECT failed_change_id
      FROM media_delivery_registry_projection_work_items WHERE media_delivery_registry_record_id = ${id}::uuid
    `)
  await transaction.rollback()
  return inTransaction.rows[0]!.failed_change_id
}

export async function rejectOldGenerationMediaReplayMembership(id: string) {
  return write(sql`/* rejectOldGenerationMediaReplayMembership */
      INSERT INTO media_delivery_registry_changes
        (media_delivery_registry_record_id, generation, change_type, completed_at)
      SELECT id, generation - 1, 'completed', clock_timestamp()
      FROM media_delivery_registry_records WHERE id = ${id}::uuid
    `)
}

export async function regenerateMediaReplayMembership(id: string) {
  await write(sql`/* regenerateMediaReplayMembershipFixture */
      UPDATE media_delivery_registry_records SET generation = generation + 1 WHERE id = ${id}::uuid
    `)
}

export async function completeMediaReplayMembership(id: string) {
  await write(sql`/* completeMediaReplayMembershipFixture */
      INSERT INTO media_delivery_registry_changes
        (media_delivery_registry_record_id, generation, change_type, completed_at)
      SELECT id, generation, 'completed', clock_timestamp()
      FROM media_delivery_registry_records WHERE id = ${id}::uuid
    `)
}

/** Simulate an accepted transition whose UUID sorts before previously committed history. */
export async function appendLowerUuidMediaDeliveryTransition(
  id: string,
  changeType: 'pending' | 'completed',
  changedById: string | null = null,
) {
  const { rows } = await write<{ id: string; changed_by_id: string | null }>(sql`
    /* appendLowerUuidMediaDeliveryTransition */
    INSERT INTO media_delivery_registry_changes
      (id, media_delivery_registry_record_id, generation, change_type, changed_by_id, completed_at)
    SELECT uuidv7(interval '-1 day'), id, generation, ${changeType}::media_delivery_registry_change_types,
      ${changedById}::uuid, CASE WHEN ${changeType} = 'completed' THEN clock_timestamp() ELSE NULL END
    FROM media_delivery_registry_records WHERE id = ${id}::uuid
    RETURNING id, changed_by_id
  `)
  if (!rows[0]) throw new Error(`Missing media delivery transition fixture ${id}`)
  return rows[0]
}

export async function claimTestMediaDeliveryMembership(id: string) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* claimTestMediaDeliveryMembership:lock */
    SELECT id FROM media_delivery_registry_records WHERE id = ${id}::uuid FOR UPDATE
  `)
  const claim = await claimMediaDeliveryProjection(transaction, id)
  if (!claim) throw new Error(`Missing claimable media delivery fixture ${id}`)
  await transaction.commit()
  return claim
}
