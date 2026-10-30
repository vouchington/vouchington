import sql from 'sql-template-strings'
import type { CopyrightMinimalBlockerPhase } from './retention-minimal-blocker-phase-types.mts'

export const COPYRIGHT_MINIMAL_BLOCKER_PHASES_1: readonly CopyrightMinimalBlockerPhase[] = [
  {
    table: 'copyright_notice_submissions',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalSubmissionBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT submission.id FROM copyright_notice_submissions submission
        WHERE submission.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR submission.id > ${cursor}::uuid)
        ORDER BY submission.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT submission.id,
          (submission.kind = 'appeal' AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_appeal_reviews review
            WHERE review.copyright_notice_submission_id = submission.id))
          OR (submission.kind = 'counter_notice' AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_counter_notice_reviews review
            WHERE review.copyright_notice_submission_id = submission.id))
          OR (submission.kind = 'court_or_ccb_hold' AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_legal_hold_assessments assessment
            WHERE assessment.copyright_notice_submission_id = submission.id)) AS blocked
        FROM selected JOIN copyright_notice_submissions submission ON submission.id = selected.id
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        COALESCE((SELECT bool_or(blocked) FROM facts), false) AS blocked,
        false AS valid_target, false AS unrestricted_target,
        false AS claimant_receipt, false AS notice_assessment, false AS form_assessment`,
  },
  {
    table: 'copyright_notice_targets',
    statement: (noticeId, cursor, pageSize) => sql`/* scanCopyrightMinimalTargetBlockers */
      WITH candidate AS MATERIALIZED (
        SELECT target.id FROM copyright_notice_targets target
        WHERE target.copyright_notice_id = ${noticeId}
          AND (${cursor}::uuid IS NULL OR target.id > ${cursor}::uuid)
        ORDER BY target.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (
        SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}
      ), facts AS MATERIALIZED (
        SELECT target.id,
          char_length(btrim(target.hosted_use_url)) > 0
            AND EXISTS (SELECT 1 FROM copyright_notice_target_images image
              WHERE image.copyright_notice_target_id = target.id) AS valid_target,
          NOT EXISTS (SELECT 1 FROM copyright_restrictions restriction
            WHERE restriction.copyright_notice_target_id = target.id) AS unrestricted_target
        FROM selected JOIN copyright_notice_targets target ON target.id = selected.id
      )
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        false AS blocked,
        COALESCE((SELECT bool_or(valid_target) FROM facts), false) AS valid_target,
        COALESCE((SELECT bool_or(unrestricted_target) FROM facts), false) AS unrestricted_target,
        false AS claimant_receipt, false AS notice_assessment, false AS form_assessment`,
  },
]
