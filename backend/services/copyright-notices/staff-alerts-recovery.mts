import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightStaffAlertPolicyActive } from './staff-alerts-policy.mts'
import { syncCopyrightStaffAlerts } from './staff-alerts-sync.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/** Pages cases that currently match an alert condition or still have an unresolved alert. */
export function searchCopyrightStaffAlertNoticeIds(
  options: CopyrightSweepPageOptions = {},
): Promise<CopyrightSweepIdPage> {
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright staff alert cursor',
    'searchCopyrightStaffAlertNoticeIds',
    'rowId',
    sql`/* searchCopyrightStaffAlertNoticeIds */
      SELECT id
      FROM copyright_notices
      WHERE EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
        WHERE target.copyright_notice_id = copyright_notices.id
          AND restriction.lifted_at IS NULL AND restriction.human_reviewed_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM copyright_notice_deadlines deadline
        WHERE deadline.copyright_notice_id = copyright_notices.id
          AND deadline.resolved_at IS NULL AND deadline.cancelled_at IS NULL
          AND deadline.restoration_deadline_at <= CURRENT_TIMESTAMP
      ) OR EXISTS (
        SELECT 1 FROM copyright_notice_delivery_intents intent
        WHERE intent.copyright_notice_id = copyright_notices.id
          AND (intent.state IN ('failed', 'bounced')
            OR (intent.state IN ('pending', 'claimed') AND intent.delivery_attempt_count > 0))
      ) OR EXISTS (
        SELECT 1 FROM copyright_staff_alerts alert
        WHERE alert.copyright_notice_id = copyright_notices.id AND alert.resolved_at IS NULL
      )`,
    statement => read(statement),
  )
}

/** Refreshes alert episodes from current facts. No-ops until an approval row exists. */
export async function syncCopyrightStaffAlertsFromRecovery(): Promise<void> {
  if (!(await copyrightStaffAlertPolicyActive())) return
  let after: string | undefined
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- advance only after this page is synced
    const page = await searchCopyrightStaffAlertNoticeIds(after ? { after } : {})
    if (page.results.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- sync this page before reading the next cursor
      await syncCopyrightStaffAlerts({ noticeIds: page.results })
    }
    const cursor = page.page_info.end_cursor
    if (!page.page_info.has_next_page || !cursor || cursor === after) return
    after = cursor
  }
}
