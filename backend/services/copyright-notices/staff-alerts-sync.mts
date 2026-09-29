import { write } from '@data-stores/psql'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import sql from 'sql-template-strings'
import { copyrightStaffAlertPolicyActive } from './staff-alerts-policy.mts'

/**
 * Upserts alert episodes for the given cases and resolves episodes whose source condition cleared.
 * Does not update deadline or delivery rows. No-ops when no approval is active.
 */
export async function syncCopyrightStaffAlerts(input: {
  noticeIds: readonly string[]
}): Promise<void> {
  if (input.noticeIds.length === 0) return
  observeSharedDbScope('syncCopyrightStaffAlerts', sharedDbIdsScope(input.noticeIds))
  if (!(await copyrightStaffAlertPolicyActive())) return
  const noticeIds = [...input.noticeIds]
  await write(sql`/* syncCopyrightStaffAlerts */
    WITH policy AS (
      SELECT 1 FROM copyright_staff_alert_policies WHERE revoked_at IS NULL
    ), unreviewed AS (
      SELECT target.copyright_notice_id, MAX(restriction.imposed_at) AS latest_imposed_at
      FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = ANY(${noticeIds}::uuid[])
        AND restriction.lifted_at IS NULL AND restriction.human_reviewed_at IS NULL
      GROUP BY target.copyright_notice_id
    ), desired AS (
      SELECT notice.id AS copyright_notice_id, NULL::uuid AS copyright_notice_deadline_id,
        NULL::uuid AS copyright_notice_delivery_intent_id, 'awaiting_review'::text AS condition,
        unreviewed.latest_imposed_at AS condition_opened_at
      FROM copyright_notices notice
      JOIN unreviewed ON unreviewed.copyright_notice_id = notice.id
      WHERE notice.id = ANY(${noticeIds}::uuid[]) AND EXISTS (SELECT 1 FROM policy)
      UNION ALL
      SELECT notice.id, NULL::uuid, NULL::uuid, 'urgent_filing',
        GREATEST(notice.provisional_withholding_at, unreviewed.latest_imposed_at)
      FROM copyright_notices notice
      JOIN unreviewed ON unreviewed.copyright_notice_id = notice.id
      WHERE notice.id = ANY(${noticeIds}::uuid[]) AND notice.provisional_withholding_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM policy)
      UNION ALL
      SELECT deadline.copyright_notice_id, deadline.id, NULL::uuid, 'missed_deadline',
        deadline.restoration_deadline_at
      FROM copyright_notice_deadlines deadline
      WHERE deadline.copyright_notice_id = ANY(${noticeIds}::uuid[])
        AND deadline.resolved_at IS NULL AND deadline.cancelled_at IS NULL
        AND deadline.restoration_deadline_at <= CURRENT_TIMESTAMP
        AND EXISTS (SELECT 1 FROM policy)
      UNION ALL
      SELECT intent.copyright_notice_id, NULL::uuid, intent.id,
        CASE WHEN intent.state = 'failed' THEN 'delivery_failed'
          WHEN intent.state = 'bounced' THEN 'delivery_bounced'
          ELSE 'reconciliation_needed' END,
        CASE WHEN intent.state = 'failed' THEN intent.failed_at
          WHEN intent.state = 'bounced' THEN intent.bounced_at
          ELSE COALESCE(intent.delivery_attempted_at, intent.claimed_at, intent.created_at) END
      FROM copyright_notice_delivery_intents intent
      WHERE intent.copyright_notice_id = ANY(${noticeIds}::uuid[]) AND EXISTS (SELECT 1 FROM policy)
        AND (intent.state IN ('failed', 'bounced')
          OR (intent.state IN ('pending', 'claimed') AND intent.delivery_attempt_count > 0))
    ), upserted_case AS (
      INSERT INTO copyright_staff_alerts (
        copyright_notice_id, condition, condition_opened_at
      )
      SELECT copyright_notice_id, condition, condition_opened_at FROM desired
      WHERE copyright_notice_deadline_id IS NULL AND copyright_notice_delivery_intent_id IS NULL
      ON CONFLICT (copyright_notice_id, condition)
        WHERE copyright_notice_deadline_id IS NULL AND copyright_notice_delivery_intent_id IS NULL
      DO UPDATE SET condition_opened_at = EXCLUDED.condition_opened_at, resolved_at = NULL
      WHERE copyright_staff_alerts.condition_opened_at IS DISTINCT FROM EXCLUDED.condition_opened_at
        OR copyright_staff_alerts.resolved_at IS NOT NULL
      RETURNING id
    ), upserted_deadline AS (
      INSERT INTO copyright_staff_alerts (
        copyright_notice_id, copyright_notice_deadline_id, condition, condition_opened_at
      )
      SELECT copyright_notice_id, copyright_notice_deadline_id, condition, condition_opened_at
      FROM desired WHERE copyright_notice_deadline_id IS NOT NULL
      ON CONFLICT (copyright_notice_deadline_id, condition) WHERE copyright_notice_deadline_id IS NOT NULL
      DO UPDATE SET condition_opened_at = EXCLUDED.condition_opened_at, resolved_at = NULL
      WHERE copyright_staff_alerts.condition_opened_at IS DISTINCT FROM EXCLUDED.condition_opened_at
        OR copyright_staff_alerts.resolved_at IS NOT NULL
      RETURNING id
    ), upserted_delivery AS (
      INSERT INTO copyright_staff_alerts (
        copyright_notice_id, copyright_notice_delivery_intent_id, condition, condition_opened_at
      )
      SELECT copyright_notice_id, copyright_notice_delivery_intent_id, condition, condition_opened_at
      FROM desired WHERE copyright_notice_delivery_intent_id IS NOT NULL
      ON CONFLICT (copyright_notice_delivery_intent_id, condition)
        WHERE copyright_notice_delivery_intent_id IS NOT NULL
      DO UPDATE SET condition_opened_at = EXCLUDED.condition_opened_at, resolved_at = NULL
      WHERE copyright_staff_alerts.condition_opened_at IS DISTINCT FROM EXCLUDED.condition_opened_at
        OR copyright_staff_alerts.resolved_at IS NOT NULL
      RETURNING id
    ), resolved AS (
      UPDATE copyright_staff_alerts alert
      SET resolved_at = CURRENT_TIMESTAMP
      WHERE alert.copyright_notice_id = ANY(${noticeIds}::uuid[]) AND alert.resolved_at IS NULL
        AND EXISTS (SELECT 1 FROM policy)
        AND NOT EXISTS (
          SELECT 1 FROM desired
          WHERE desired.copyright_notice_id = alert.copyright_notice_id
            AND desired.condition = alert.condition
            AND desired.copyright_notice_deadline_id IS NOT DISTINCT FROM alert.copyright_notice_deadline_id
            AND desired.copyright_notice_delivery_intent_id
              IS NOT DISTINCT FROM alert.copyright_notice_delivery_intent_id
        )
      RETURNING alert.id
    )
    SELECT
      (SELECT count(*) FROM upserted_case) + (SELECT count(*) FROM upserted_deadline)
      + (SELECT count(*) FROM upserted_delivery) + (SELECT count(*) FROM resolved)
  `)
}
