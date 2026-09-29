import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readCopyrightStaffAlertPolicy(): Promise<{
  approved_by_user_id: string | null
  approved_by_user_erased_at: Date | null
  revoked_at: Date | null
} | null> {
  const { rows } = await read<{
    approved_by_user_id: string | null
    approved_by_user_erased_at: Date | null
    revoked_at: Date | null
  }>(sql`/* readCopyrightStaffAlertPolicy */
    SELECT approved_by_user_id, approved_by_user_erased_at, revoked_at
    FROM copyright_staff_alert_policies WHERE revoked_at IS NULL`)
  return rows[0] ?? null
}

export async function insertErasableCopyrightStaffActor(): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertErasableCopyrightStaffActor */
    INSERT INTO users DEFAULT VALUES RETURNING id`)
  const actorId = rows[0]?.id
  if (!actorId) throw new Error('Erasable copyright staff actor was not inserted')
  return actorId
}

export async function eraseCopyrightStaffActor(userId: string): Promise<void> {
  const { rowCount } = await write(sql`/* eraseCopyrightStaffActor */
    DELETE FROM users WHERE id = ${userId}`)
  if (!rowCount) throw new Error(`Copyright staff actor ${userId} was not erased`)
}
