import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** True only while a retained, unrevoked approval row exists. */
export async function copyrightStaffAlertPolicyActive(): Promise<boolean> {
  const { rows } = await read<{ active: boolean }>(sql`/* copyrightStaffAlertPolicyActive */
    SELECT EXISTS (
      SELECT 1 FROM copyright_staff_alert_policies WHERE revoked_at IS NULL
    ) AS active
  `)
  return rows[0]?.active === true
}

/** Records approval. A second call while one approval is active does not insert another row. */
export async function approveCopyrightStaffAlertPolicy(input: {
  approvedByUserId: string
}): Promise<void> {
  await write(sql`/* approveCopyrightStaffAlertPolicy */
    INSERT INTO copyright_staff_alert_policies (approved_at, approved_by_user_id)
    SELECT CURRENT_TIMESTAMP, ${input.approvedByUserId}
    WHERE NOT EXISTS (
      SELECT 1 FROM copyright_staff_alert_policies WHERE revoked_at IS NULL
    )
  `)
}

/** Closes derivation and staff reads until a later approval row exists. */
export async function revokeCopyrightStaffAlertPolicy(): Promise<void> {
  await write(sql`/* revokeCopyrightStaffAlertPolicy */
    UPDATE copyright_staff_alert_policies
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE revoked_at IS NULL
  `)
}
