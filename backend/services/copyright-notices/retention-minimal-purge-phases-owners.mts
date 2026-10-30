import sql from 'sql-template-strings'
import type { CopyrightMinimalPurgePhase } from './retention-minimal-purge-types.mts'

/** Cap raw owner-scoped IDs before excluding the structurally bounded current unit. */
export const COPYRIGHT_MINIMAL_PURGE_OWNER_PHASES: readonly CopyrightMinimalPurgePhase[] = [
  {
    table: 'copyright_notice_submission_assessment_identities',
    // One identity plus the entire finite cursor domain, even if references arrive late.
    maxPhysicalRowsPerParent: 9,
    scanCursor: true,
    statement: (
      noticeId,
      pageSize,
      cursor,
    ) => sql`/* drainCopyrightMinimalOwner_copyright_notice_submission_assessment_identities */
      WITH candidate AS MATERIALIZED (
        SELECT id FROM copyright_notice_submission_assessment_identities
        WHERE copyright_notice_id = ${noticeId} AND id > COALESCE(${cursor}::uuid, '00000000-0000-7000-8000-000000000000'::uuid)
        ORDER BY id LIMIT ${pageSize + 1}
      ), page AS MATERIALIZED (SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}),
      deleted AS (DELETE FROM copyright_notice_submission_assessment_identities target USING page
        WHERE target.id = page.id AND NOT EXISTS (SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.id = target.copyright_notice_submission_id
          AND submission.current_assessment_identity_id = target.id)
        AND NOT EXISTS (SELECT 1 FROM copyright_notices notice
          WHERE notice.id = ${noticeId} AND notice.territorial_authorizing_assessment_identity_id = target.id) RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM deleted)::integer AS deleted,
        (SELECT id FROM page ORDER BY id DESC LIMIT 1) AS last_id`,
  },
  {
    table: 'copyright_territorial_decision_identities',
    scanCursor: true,
    statement: (
      noticeId,
      pageSize,
      cursor,
    ) => sql`/* drainCopyrightMinimalOwner_copyright_territorial_decision_identities */
      WITH candidate AS MATERIALIZED (
        SELECT id FROM copyright_territorial_decision_identities
        WHERE copyright_notice_id = ${noticeId} AND id > COALESCE(${cursor}::uuid, '00000000-0000-7000-8000-000000000000'::uuid)
        ORDER BY id LIMIT ${pageSize + 1}
      ), page AS MATERIALIZED (SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}),
      deleted AS (DELETE FROM copyright_territorial_decision_identities target USING page
        WHERE target.id = page.id AND NOT EXISTS (SELECT 1 FROM copyright_notices notice
        WHERE notice.id = ${noticeId} AND notice.current_territorial_decision_identity_id = target.id) RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM deleted)::integer AS deleted,
        (SELECT id FROM page ORDER BY id DESC LIMIT 1) AS last_id`,
  },
  {
    table: 'copyright_notice_form_screenings',
    scanCursor: true,
    statement: (
      noticeId,
      pageSize,
      cursor,
    ) => sql`/* drainCopyrightMinimalOwner_copyright_notice_form_screenings */
      WITH candidate AS MATERIALIZED (
        SELECT id FROM copyright_notice_form_screenings
        WHERE copyright_notice_id = ${noticeId} AND id > COALESCE(${cursor}::uuid, '00000000-0000-7000-8000-000000000000'::uuid)
        ORDER BY id LIMIT ${pageSize + 1}
      ), page AS MATERIALIZED (SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}),
      deleted AS (DELETE FROM copyright_notice_form_screenings target USING page
        WHERE target.id = page.id AND NOT EXISTS (SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.id = target.copyright_notice_submission_id
          AND submission.current_assessment_form_screening_id = target.id) RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM deleted)::integer AS deleted,
        (SELECT id FROM page ORDER BY id DESC LIMIT 1) AS last_id`,
  },
]
