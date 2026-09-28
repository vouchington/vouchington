import { read, write } from '@data-stores/psql'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightStaffAlertPolicyActive } from './staff-alerts-policy.mts'
import type {
  CopyrightStaffAlert,
  CopyrightStaffAlertAcknowledgement,
} from './staff-alerts-types.mts'

export type {
  CopyrightStaffAlert,
  CopyrightStaffAlertAcknowledgement,
} from './staff-alerts-types.mts'

/** Open episodes for these cases. Private legal fields stay empty unless the caller may review and a policy is active. */
export async function listOpenCopyrightStaffAlerts(
  currentUser: PrivateUser,
  noticeIds: readonly string[],
): Promise<CopyrightStaffAlert[]> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser) || noticeIds.length === 0) return []
  if (!(await copyrightStaffAlertPolicyActive())) return []
  observeSharedDbScope('listOpenCopyrightStaffAlerts', sharedDbIdsScope(noticeIds))
  const { rows } = await read<CopyrightStaffAlert>(sql`/* listOpenCopyrightStaffAlerts */
    SELECT alert.id, alert.copyright_notice_id, alert.condition, alert.condition_opened_at,
      notice.work_description, notice.claimant_contact_ciphertext, intent.failure_ciphertext
    FROM copyright_staff_alerts alert
    JOIN copyright_notices notice ON notice.id = alert.copyright_notice_id
    LEFT JOIN copyright_notice_delivery_intents intent
      ON intent.id = alert.copyright_notice_delivery_intent_id
    WHERE alert.copyright_notice_id = ANY(${[...noticeIds]}::uuid[]) AND alert.resolved_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM copyright_staff_alert_acknowledgements acknowledgement
        WHERE acknowledgement.copyright_staff_alert_id = alert.id
          AND acknowledgement.condition_opened_at = alert.condition_opened_at
      )
    ORDER BY alert.id
  `)
  return rows
}

/** Acknowledgement history for these cases, including episodes that are no longer open. */
export async function listCopyrightStaffAlertAcknowledgements(
  currentUser: PrivateUser,
  noticeIds: readonly string[],
): Promise<CopyrightStaffAlertAcknowledgement[]> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser) || noticeIds.length === 0) return []
  if (!(await copyrightStaffAlertPolicyActive())) return []
  observeSharedDbScope('listCopyrightStaffAlertAcknowledgements', sharedDbIdsScope(noticeIds))
  const { rows } = await read<CopyrightStaffAlertAcknowledgement>(
    sql`/* listCopyrightStaffAlertAcknowledgements */
      SELECT acknowledgement.id, acknowledgement.copyright_staff_alert_id,
        acknowledgement.condition_opened_at, acknowledgement.acknowledged_at,
        acknowledgement.acknowledged_by_user_id, acknowledgement.acknowledged_by_user_erased_at
      FROM copyright_staff_alert_acknowledgements acknowledgement
      JOIN copyright_staff_alerts alert ON alert.id = acknowledgement.copyright_staff_alert_id
      WHERE alert.copyright_notice_id = ANY(${[...noticeIds]}::uuid[])
      ORDER BY acknowledgement.id
    `,
  )
  return rows
}

/** Records one acknowledgement for the alert's current episode. Repeat calls for that episode insert nothing. */
export async function acknowledgeCopyrightStaffAlert(input: {
  currentUser: PrivateUser
  alertId: string
}): Promise<boolean> {
  assertNotSuspended(input.currentUser)
  assert(
    currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Copyright staff alerts are private',
  )
  assert(await copyrightStaffAlertPolicyActive(), 409, 'Copyright staff alerts are not configured')
  const { rows } = await write<{ found: number }>(sql`/* acknowledgeCopyrightStaffAlert */
    WITH target AS (
      SELECT id, condition_opened_at FROM copyright_staff_alerts
      WHERE id = ${input.alertId} AND resolved_at IS NULL
    ), inserted AS (
      INSERT INTO copyright_staff_alert_acknowledgements (
        copyright_staff_alert_id, acknowledged_at, acknowledged_by_user_id, condition_opened_at
      )
      SELECT id, CURRENT_TIMESTAMP, ${input.currentUser.id}, condition_opened_at FROM target
      ON CONFLICT (copyright_staff_alert_id, condition_opened_at) DO NOTHING
      RETURNING id
    )
    SELECT count(*)::integer AS found FROM target
  `)
  return rows[0]?.found === 1
}
