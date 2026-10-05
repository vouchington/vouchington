import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { unassessedCourtFilingSql } from './unassessed-court-filing-sql.mts'

type CopyrightQuery = TransactionQuery

/** A court or CCB filing has no target scope until its assessment exists, so the
 * whole case stays unrestorable. The notice lock serializes that check with admission. */
export async function noticeHasUnassessedCourtOrCcbFiling(
  noticeId: string,
  query: CopyrightQuery,
): Promise<boolean> {
  await query(sql`/* noticeHasUnassessedCourtOrCcbFiling:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  const { rows } = await query<{ blocked: boolean }>(
    sql`
    /* noticeHasUnassessedCourtOrCcbFiling */
    SELECT `.append(unassessedCourtFilingSql(sql`${noticeId}`)).append(sql` AS blocked
  `),
  )
  return rows[0]?.blocked ?? true
}

export async function copyrightTargetRestoreIsBlocked(
  noticeId: string,
  restrictionId: string,
  now: Date,
  query: CopyrightQuery,
): Promise<boolean> {
  if (await noticeHasUnassessedCourtOrCcbFiling(noticeId, query)) return true
  const { rows } = await query<{ blocked: boolean }>(sql`
    /* copyrightTargetRestoreIsBlocked */
    SELECT EXISTS (
      SELECT 1
      FROM copyright_notice_legal_hold_assessments hold
      JOIN copyright_notice_submissions submission
        ON submission.id = hold.copyright_notice_submission_id
      JOIN copyright_notice_legal_hold_assessment_targets hold_target
        ON hold_target.copyright_notice_legal_hold_assessment_id = hold.id
      LEFT JOIN copyright_notice_legal_hold_resolutions resolution
        ON resolution.copyright_notice_legal_hold_assessment_id = hold.id
      WHERE submission.copyright_notice_id = ${noticeId}
        AND hold_target.copyright_notice_target_id = (
          SELECT copyright_notice_target_id FROM copyright_restrictions
          WHERE id = ${restrictionId}
        )
        AND resolution.id IS NULL
        AND hold.is_from_original_claimant
        AND hold.is_same_material
        AND hold.proceeding_kind IS NOT NULL
        AND hold.commenced_at IS NOT NULL
        AND hold.received_by_designated_agent_at IS NOT NULL
        AND hold.received_by_designated_agent_at <= ${now}
    ) AS blocked
  `)
  return rows[0]?.blocked ?? true
}
