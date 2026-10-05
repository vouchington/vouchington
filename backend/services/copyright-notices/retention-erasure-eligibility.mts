import sql, { type SQLStatement } from 'sql-template-strings'
import { copyrightStaffQueueKeysSql } from './read-models-staff-queue-sql.mts'
import { COPYRIGHT_PRESERVATION_PARTIES_SQL } from './retention-erasure-preservation.mts'

/**
 * Opens the `queue_key`, `preservation`, `blocked` and `eligible` CTEs that decide which US DMCA
 * cases the retention sweep may erase; callers append their own `SELECT ... FROM eligible`.
 *
 * `blocked` collects every case with: open staff work (the staff queue's own rule, so an
 * undecided intake, pending restriction review, open appeal, failed media action or pending
 * enforcement counts), an open counter-notice or restoration deadline, a restriction still in
 * force, an open qualifying court or CCB hold, an is_operative repeat-infringer incident, an open
 * legal-process preservation hold on any account that is a party to the case, an unfinished
 * delivery, or a guest capability that can still file. A case whose only queue item is a failed
 * or bounced delivery is not blocked: that item has no staff action that clears it, so it would
 * hold the case forever. The clock below still waits out the retention period from the
 * delivery's last change.
 *
 * `eligible` also needs the case's retention clock to have run out. The clock restarts at the
 * latest of the case's last lifecycle event and the last change to a delivery, incident, guest
 * capability or preservation hold, none of which write a lifecycle event, so a blocker that has
 * just cleared never makes a case instantly erasable. Cases already erased are never offered again. Only `us_dmca`
 * cases are covered until counsel decides the EU and UK records.
 */
export function copyrightRetentionEligibleSql(now: Date, cutoff: Date): SQLStatement {
  return copyrightStaffQueueKeysSql()
    .append(', preservation AS (')
    .append(COPYRIGHT_PRESERVATION_PARTIES_SQL).append(sql`), blocked AS (
      SELECT id AS notice_id FROM queue_key WHERE reasons <> ARRAY['delivery_failed']
      UNION ALL
      SELECT copyright_notice_id FROM copyright_notice_deadlines
      WHERE resolved_at IS NULL AND cancelled_at IS NULL
      UNION ALL
      SELECT target.copyright_notice_id FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE restriction.lifted_at IS NULL
      UNION ALL
      SELECT submission.copyright_notice_id FROM copyright_notice_submissions submission
      JOIN copyright_notice_legal_hold_assessments hold
        ON hold.copyright_notice_submission_id = submission.id
      WHERE submission.kind = 'court_or_ccb_hold'
        AND hold.is_from_original_claimant AND hold.is_same_material
        AND hold.proceeding_kind IS NOT NULL AND hold.commenced_at IS NOT NULL
        AND hold.received_by_designated_agent_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_legal_hold_resolutions resolution
          WHERE resolution.copyright_notice_legal_hold_assessment_id = hold.id
        )
      UNION ALL
      SELECT copyright_notice_id FROM copyright_repeat_infringer_incidents WHERE is_operative
      UNION ALL
      SELECT notice_id FROM preservation WHERE released_at IS NULL
      UNION ALL
      SELECT copyright_notice_id FROM copyright_notice_delivery_intents
      WHERE copyright_notice_id IS NOT NULL AND state IN ('pending', 'claimed')
      UNION ALL
      SELECT copyright_notice_id FROM copyright_notice_guest_capabilities
      WHERE revoked_at IS NULL AND expires_at > ${now}
    ), eligible AS (
      SELECT notice.id FROM copyright_notices notice
      WHERE notice.jurisdiction = 'us_dmca'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_retention_erasures erased
          WHERE erased.copyright_notice_id = notice.id
        )
        AND NOT EXISTS (SELECT 1 FROM blocked WHERE blocked.notice_id = notice.id)
        AND GREATEST(
          notice.created_at,
          (SELECT event.created_at FROM copyright_notice_lifecycle_changes event
           WHERE event.copyright_notice_id = notice.id ORDER BY event.id DESC LIMIT 1),
          (SELECT max(intent.updated_at) FROM copyright_notice_delivery_intents intent
           WHERE intent.copyright_notice_id = notice.id),
          (SELECT max(incident.updated_at) FROM copyright_repeat_infringer_incidents incident
           WHERE incident.copyright_notice_id = notice.id),
          (SELECT max(capability.updated_at) FROM copyright_notice_guest_capabilities capability
           WHERE capability.copyright_notice_id = notice.id),
          (SELECT max(capability.expires_at) FROM copyright_notice_guest_capabilities capability
           WHERE capability.copyright_notice_id = notice.id AND capability.revoked_at IS NULL),
          (SELECT max(held.released_at) FROM preservation held WHERE held.notice_id = notice.id)
        ) <= ${cutoff}
    )
  `)
}
