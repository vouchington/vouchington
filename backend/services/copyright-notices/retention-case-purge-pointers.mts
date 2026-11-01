import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** FK cycles cut after report and evidence proof, before child-first deletion. */
export const COPYRIGHT_CASE_POINTER_CUTS = [
  ['copyright_territorial_decisions', ['supersedes_decision_id']],
  [
    'copyright_notice_submissions',
    [
      'copyright_notice_guest_capability_id',
      'current_assessment_identity_id',
      'current_assessment_form_screening_id',
    ],
  ],
  ['copyright_territorial_redress_requests', ['current_staff_decision_identity_id']],
  ['copyright_notice_email_intakes', ['current_recommendation_identity_id']],
] as const
export const COPYRIGHT_CASE_POINTER_PHASE_COUNT = COPYRIGHT_CASE_POINTER_CUTS.length

/** Null only current FK cycles, after the locked legal and reporting proof. */
export async function cutCopyrightCasePointerPage(
  query: TransactionQuery,
  noticeId: string,
  phaseIndex: number,
  limit: number,
  afterId: string | null,
): Promise<{ nextPhaseIndex: number; cut: number; nextAfterId: string | null }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid copyright pointer page size')
  const table = COPYRIGHT_CASE_POINTER_CUTS[phaseIndex]?.[0]
  if (!table) return { nextPhaseIndex: phaseIndex, cut: 0, nextAfterId: null }
  await query(sql`/* scopeCopyrightCasePointerCut */
    SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_case_purge_table', ${table}, true)`)
  if (phaseIndex === 0) {
    const { rows } = await query<{ cut: number }>(sql`/* cutCopyrightCaseDecisionPredecessors */
      WITH page AS MATERIALIZED (
        -- no-mistakes-disable-next-line postgres-required-predicates: the case spans decision-id partitions; notice_id leads the indexed bounded page and predecessor pointers must be cut in every partition.
        SELECT id FROM copyright_territorial_decisions
        WHERE copyright_notice_id = ${noticeId}::uuid
          AND supersedes_decision_id IS NOT NULL
        ORDER BY id LIMIT ${limit} FOR UPDATE
      ), changed AS (
        UPDATE copyright_territorial_decisions decision
        SET supersedes_decision_id = NULL
        FROM page WHERE decision.id = page.id RETURNING 1
      ) SELECT count(*)::integer AS cut FROM changed`)
    const cut = rows[0]?.cut ?? 0
    return { nextPhaseIndex: cut < limit ? 1 : 0, cut, nextAfterId: null }
  }
  if (phaseIndex === 1) {
    const { rows } = await query<{ cut: number }>(sql`/* cutCopyrightCaseSubmissionPointers */
      WITH page AS MATERIALIZED (
        SELECT id FROM copyright_notice_submissions
        WHERE copyright_notice_id = ${noticeId}::uuid AND (
          copyright_notice_guest_capability_id IS NOT NULL
          OR current_assessment_identity_id IS NOT NULL
          OR current_assessment_form_screening_id IS NOT NULL)
        ORDER BY id LIMIT ${limit} FOR UPDATE
      ), changed AS (
        UPDATE copyright_notice_submissions submission SET
          copyright_notice_guest_capability_id = NULL,
          current_assessment_identity_id = NULL,
          current_assessment_is_substantially_compliant = NULL,
          current_assessed_at = NULL,
          current_assessed_by_id = NULL,
          current_assessment_form_screening_id = NULL
        FROM page WHERE submission.id = page.id RETURNING 1
      ) SELECT count(*)::integer AS cut FROM changed`)
    const cut = rows[0]?.cut ?? 0
    return { nextPhaseIndex: cut < limit ? 2 : 1, cut, nextAfterId: null }
  }
  if (phaseIndex === 2) {
    const { rows } = await query<{ cut: number }>(sql`/* cutCopyrightCaseRedressPointers */
    WITH page AS MATERIALIZED (
      SELECT id FROM copyright_territorial_redress_requests
      WHERE copyright_notice_id = ${noticeId}::uuid
        AND current_staff_decision_identity_id IS NOT NULL
      ORDER BY id LIMIT ${limit} FOR UPDATE
    ), changed AS (
      UPDATE copyright_territorial_redress_requests request SET
        staff_disposition = NULL,
        current_staff_decision_identity_id = NULL,
        decided_at = NULL,
        decided_by_id = NULL,
        rationale_ciphertext = NULL
      FROM page WHERE request.id = page.id RETURNING 1
    ) SELECT count(*)::integer AS cut FROM changed`)
    const cut = rows[0]?.cut ?? 0
    return { nextPhaseIndex: cut < limit ? 3 : 2, cut, nextAfterId: null }
  }

  const cursor = afterId ? sql` AND link.id > ${afterId}::uuid` : sql``
  const { rows: page } = await query<{ id: string; intake_id: string }>(
    sql`/* readCopyrightCaseIntakePointerPage */
      SELECT link.id, intake.id AS intake_id
      FROM copyright_notice_email_intake_notice_links link
      JOIN copyright_notice_email_intakes intake
        ON intake.id = link.copyright_notice_email_intake_id
      WHERE link.copyright_notice_id = ${noticeId}::uuid`
      .append(cursor)
      .append(sql` ORDER BY link.id LIMIT ${limit} FOR UPDATE OF intake NOWAIT`),
  )
  const intakeIds = page.map(row => row.intake_id)
  if (intakeIds.length > 0)
    await query(sql`/* cutCopyrightCaseIntakeRecommendationPointers */
      UPDATE copyright_notice_email_intakes SET
        current_recommendation_identity_id = NULL,
        current_recommendation_output_ciphertext = NULL,
        recommendation_completed_at = NULL
      WHERE id = ANY(${intakeIds}::uuid[])
        AND current_recommendation_identity_id IS NOT NULL`)
  return {
    nextPhaseIndex: page.length < limit ? 4 : 3,
    cut: intakeIds.length,
    nextAfterId: page.length === limit ? page.at(-1)!.id : null,
  }
}
