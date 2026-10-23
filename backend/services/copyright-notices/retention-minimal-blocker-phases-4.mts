import sql from 'sql-template-strings'
import type { CopyrightMinimalBlockerPhase } from './retention-minimal-blocker-phase-types.mts'

export const COPYRIGHT_MINIMAL_BLOCKER_PHASES_4: readonly CopyrightMinimalBlockerPhase[] = [
  {
    table: 'copyright_restrictions',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalStaydownBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT restriction.id FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR restriction.id > ${cursor}::uuid)
        ORDER BY restriction.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT selected.id,
          EXISTS (SELECT 1 FROM copyright_staydown_entries entry
            JOIN copyright_staydown_matches staydown_match
              ON staydown_match.copyright_staydown_entry_id = entry.id
            WHERE entry.copyright_restriction_id = selected.id
              AND staydown_match.reviewed_at IS NULL) AS blocked
        FROM selected
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        COALESCE((SELECT bool_or(blocked) FROM facts), false) AS blocked,
        false AS valid_target, false AS unrestricted_target,
        false AS claimant_receipt, false AS notice_assessment, false AS form_assessment`,
  },
  {
    table: 'copyright_notice_email_intake_notice_links',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalEmailThreadBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT link.copyright_notice_email_intake_id AS id
        FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR link.copyright_notice_email_intake_id > ${cursor}::uuid)
        ORDER BY link.copyright_notice_email_intake_id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT selected.id,
          link.link_kind = 'thread'
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
              WHERE review.copyright_notice_email_intake_id = selected.id)
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links other_link
              WHERE other_link.copyright_notice_email_intake_id = selected.id
                AND (other_link.link_kind <> 'thread' OR EXISTS (
                  SELECT 1 FROM copyright_notice_email_correspondence_reviews decision
                  WHERE decision.copyright_notice_email_intake_id = selected.id
                    AND decision.action IN ('admitted', 'rejected')))) AS blocked
        FROM selected JOIN copyright_notice_email_intake_notice_links link
          ON link.copyright_notice_id = ${noticeId}
            AND link.copyright_notice_email_intake_id = selected.id
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        COALESCE((SELECT bool_or(blocked) FROM facts), false) AS blocked,
        false AS valid_target, false AS unrestricted_target,
        false AS claimant_receipt, false AS notice_assessment, false AS form_assessment`,
  },
]
