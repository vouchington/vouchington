import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

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
