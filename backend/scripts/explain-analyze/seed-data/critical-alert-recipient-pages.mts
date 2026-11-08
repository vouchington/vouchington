import { write } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

export { overrideCriticalAlertRecipientPageLimitForTest } from '@voucha/test-helpers/critical-alert-page-config'

export const CRITICAL_ALERT_STAFF_COUNT = 10_000
const STAFF_START = 10_000
const HOSTNAME_ID = seedUuidAtTimestamp(Date.parse('2005-09-15T05:25:01Z'), 0)
const HOSTNAME = 'seed-critical-alert-plan.example.com'

const addedRoles: Array<{ user_id: string; role_type_id: string }> = []
let freshReportId: string | undefined
let duplicateReportId: string | undefined

export function criticalAlertStaffIds(): string[] {
  return Array.from({ length: CRITICAL_ALERT_STAFF_COUNT }, (_, offset) =>
    seedUuid(STAFF_START + offset, '01'),
  )
}

export async function seedCriticalAlertRecipientPages(): Promise<{
  freshReportId: string
  duplicateReportId: string
}> {
  const staffIds = criticalAlertStaffIds()
  const { rows: inserted } = await write<{ user_id: string; role_type_id: string }>(
    `/* seedCriticalAlertRecipientPages:roles */
    INSERT INTO user_roles (user_id, role_type_id)
    SELECT staff.user_id, role.id
    FROM unnest($1::uuid[]) AS staff(user_id)
    CROSS JOIN user_role_types role
    WHERE role.slug IN ('administrator', 'moderator')
    ORDER BY staff.user_id, role.id
    ON CONFLICT (user_id, role_type_id) DO NOTHING
    RETURNING user_id, role_type_id`,
    [staffIds],
  )
  addedRoles.push(...inserted)
  await write(
    `/* seedCriticalAlertRecipientPages:hostname */
    INSERT INTO url_hostnames (id, hostname) VALUES ($1::uuid, $2)
    ON CONFLICT (id) DO NOTHING`,
    [HOSTNAME_ID, HOSTNAME],
  )
  const { rows: cases } = await write<{ id: string }>(
    `/* seedCriticalAlertRecipientPages:case */
    INSERT INTO moderation_cases (hostname_id) VALUES ($1::uuid) RETURNING id`,
    [HOSTNAME_ID],
  )
  const caseId = cases[0]?.id
  if (!caseId) throw new Error('Critical-alert EXPLAIN case was not inserted')
  const { rows: reports } = await write<{ id: string }>(
    `/* seedCriticalAlertRecipientPages:reports */
    INSERT INTO moderation_reports
      (created_via, reporter_user_id, hostname_id, case_id, reason, original_reason)
    VALUES ('api', $1::uuid, $3::uuid, $4::uuid, 'spam', 'spam'),
      ('api', $2::uuid, $3::uuid, $4::uuid, 'spam', 'spam')
    RETURNING id`,
    [seedUuid(0, '01'), seedUuid(1, '01'), HOSTNAME_ID, caseId],
  )
  freshReportId = reports[0]?.id
  duplicateReportId = reports[1]?.id
  if (!freshReportId || !duplicateReportId)
    throw new Error('Critical-alert EXPLAIN reports were not inserted')
  await analyzeCriticalAlertRelations()
  return { freshReportId, duplicateReportId }
}

/** Deletes only roles inserted by this run; the owned hostname cascades the case and reports. */
export async function cleanupCriticalAlertRecipientPages(): Promise<void> {
  // The report FK uses SET NULL; critical-alert shape requires a report, so remove its rows first.
  await write(
    `/* cleanupCriticalAlertRecipientPages:notifications */
    DELETE FROM notifications WHERE moderation_report_id IN (
      SELECT id FROM moderation_reports WHERE hostname_id = $1::uuid
    )`,
    [HOSTNAME_ID],
  )
  await write(
    `/* cleanupCriticalAlertRecipientPages:hostname */
    DELETE FROM url_hostnames WHERE id = $1::uuid`,
    [HOSTNAME_ID],
  )
  if (addedRoles.length > 0) {
    await write(
      `/* cleanupCriticalAlertRecipientPages:roles */
      DELETE FROM user_roles ur USING unnest($1::uuid[], $2::bigint[]) AS owned(user_id, role_type_id)
      WHERE ur.user_id = owned.user_id AND ur.role_type_id = owned.role_type_id`,
      [addedRoles.map(row => row.user_id), addedRoles.map(row => row.role_type_id)],
    )
    addedRoles.length = 0
  }
  freshReportId = undefined
  duplicateReportId = undefined
  await analyzeCriticalAlertRelations()
}

async function analyzeCriticalAlertRelations(): Promise<void> {
  await write('/* analyzeCriticalAlertRecipientPages */ ANALYZE user_roles')
  await write('/* analyzeCriticalAlertRecipientPages */ ANALYZE users')
  await write('/* analyzeCriticalAlertRecipientPages */ ANALYZE notifications')
}
