import { COPYRIGHT_MINIMAL_PURGE_OWNER_PHASES } from './retention-minimal-purge-phases-owners.mts'
import sql from 'sql-template-strings'

import type { CopyrightMinimalPurgePhase } from './retention-minimal-purge-types.mts'

export const COPYRIGHT_MINIMAL_PURGE_PHASES_6: readonly CopyrightMinimalPurgePhase[] = [
  {
    table: 'copyright_notice_correspondence_messages',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_correspondence_messages */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_correspondence_messages child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_correspondence_messages target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_deadlines',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_deadlines */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_deadlines child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_deadlines target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_restrictions',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_restrictions */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_restrictions child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_restrictions target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_submission_assessments',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_submission_assessments */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_submission_assessments child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_submission_assessments target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_targets',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_targets */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_targets child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_targets target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_operational_retention_cursors',
    statement: (noticeId, pageSize) => sql`/* clearCopyrightMinimalAssessmentCursorReferences */
      WITH candidate AS MATERIALIZED (
        -- The enum primary key fixes this relation to its finite retention families.
        SELECT cursor.ctid FROM copyright_notice_operational_retention_cursors cursor
        JOIN copyright_notice_submission_assessment_identities assessment
          ON assessment.id = cursor.cursor_blocker_assessment_identity_id
        WHERE assessment.copyright_notice_id = ${noticeId} LIMIT ${pageSize + 1}
      ), page AS MATERIALIZED (SELECT ctid FROM candidate LIMIT ${pageSize}),
      changed AS (UPDATE copyright_notice_operational_retention_cursors target
        SET cursor_blocker_assessment_identity_id = NULL FROM page
        WHERE target.ctid = page.ctid RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM changed)::integer AS deleted`,
  },
  {
    table: 'copyright_decision_rationales',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimalDecisionRationales */
      WITH candidate AS MATERIALIZED (
        SELECT id FROM copyright_decision_rationales WHERE copyright_notice_id = ${noticeId}
        ORDER BY id LIMIT ${pageSize + 1}
      ), page AS MATERIALIZED (SELECT id FROM candidate ORDER BY id LIMIT ${pageSize}),
      deleted AS (DELETE FROM copyright_decision_rationales target USING page WHERE target.id = page.id RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  ...COPYRIGHT_MINIMAL_PURGE_OWNER_PHASES,
  {
    table: 'copyright_notice_submissions',
    maxPhysicalRowsPerParent: 4,
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_submissions */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_submissions child

      WHERE child.copyright_notice_id = ${noticeId}
      AND NOT EXISTS (
          SELECT 1 FROM copyright_notices notice
          JOIN copyright_notice_submission_assessment_identities authority
            ON authority.id = notice.territorial_authorizing_assessment_identity_id
          WHERE notice.id = ${noticeId} AND authority.copyright_notice_submission_id = child.id)
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_submissions target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_guest_capabilities',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_guest_capabilities */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_guest_capabilities child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_guest_capabilities target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_guest_capability_identities',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimalOwner_copyright_notice_guest_capability_identities */
      WITH candidate AS MATERIALIZED (
        SELECT ctid FROM copyright_notice_guest_capability_identities WHERE copyright_notice_id = ${noticeId} LIMIT ${pageSize + 1}
      ), page AS MATERIALIZED (SELECT ctid FROM candidate LIMIT ${pageSize}),
      deleted AS (DELETE FROM copyright_notice_guest_capability_identities target USING page
        WHERE target.ctid = page.ctid RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_email_thread_retirements',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimalOwner_copyright_notice_email_thread_retirements */
      WITH candidate AS MATERIALIZED (
        SELECT ctid FROM copyright_notice_email_thread_retirements WHERE copyright_notice_id = ${noticeId} LIMIT ${pageSize + 1}
      ), page AS MATERIALIZED (SELECT ctid FROM candidate LIMIT ${pageSize}),
      deleted AS (DELETE FROM copyright_notice_email_thread_retirements target USING page
        WHERE target.ctid = page.ctid RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
]
