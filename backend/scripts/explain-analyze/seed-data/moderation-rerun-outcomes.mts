import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

const RERUN_OUTCOME_COHORT_SIZE = 1_000
const RERUN_OUTCOME_BACKGROUND_RUN_COUNT = 100_000
export const RERUN_OUTCOME_SEEDED_RUN_COUNT =
  RERUN_OUTCOME_COHORT_SIZE + RERUN_OUTCOME_BACKGROUND_RUN_COUNT

export async function seedModerationRerunOutcomes(): Promise<{
  reportId: string
  appealId: string
  appealRequestToken: string
  reportRunIds: string[]
}> {
  const { rows: reports } = await write<{ id: string; case_id: string }>(
    `/* seedModerationRerunOutcomes:report */
     SELECT id, case_id FROM moderation_reports
     WHERE post_id = $1::uuid AND reporter_user_id = $2::uuid
     ORDER BY id LIMIT 1`,
    [seedUuid(20, '05'), seedUuid(1000, '01')],
  )
  const report = reports[0]
  if (!report?.case_id) throw new Error('Moderation rerun EXPLAIN report was not seeded')

  const { rows: appeals } = await write<{ id: string; ai_draft_request_token: string }>(
    `/* seedModerationRerunOutcomes:appeal */
     INSERT INTO moderation_appeals
       (created_via, appellant_user_id, post_id, post_removal_kind, appeal_reason, case_id)
     VALUES ('api', $1::uuid, $2::uuid, 'platform', 'EXPLAIN rerun fixture', $3::uuid)
     RETURNING id, ai_draft_request_token`,
    [seedUuid(5000, '01'), seedUuid(20, '05'), report.case_id],
  )
  const appeal = appeals[0]
  if (!appeal) throw new Error('Moderation rerun EXPLAIN appeal was not inserted')
  let reportRunIds: string[] = []
  try {
    const { rows: reportRuns } = await write<{ id: string }>(
      `/* seedModerationRerunOutcomes:reportRuns */
       INSERT INTO moderation_report_judgement_runs (moderation_report_id)
       SELECT $1::uuid FROM generate_series(1, $2::integer)
       RETURNING id`,
      [report.id, RERUN_OUTCOME_COHORT_SIZE],
    )
    const reportCohortRunIds = reportRuns.map(row => row.id)
    reportRunIds = [...reportCohortRunIds]
    await write(
      `/* seedModerationRerunOutcomes:judgements */
       INSERT INTO moderation_report_judgements
         (post_id, case_id, triggering_report_id, run_id, recommended_action,
          public_response, internal_response, model)
       SELECT $1::uuid, $2::uuid, $3::uuid, run.id, 'no_action',
              'EXPLAIN fixture', 'EXPLAIN fixture', 'explain-fixture'
       FROM moderation_report_judgement_runs run
       WHERE run.id = ANY($4::uuid[])`,
      [seedUuid(20, '05'), report.case_id, report.id, reportCohortRunIds],
    )
    await write(
      `/* seedModerationRerunOutcomes:completedReportRuns */
       UPDATE moderation_report_judgement_runs SET completed_at = now()
       WHERE id = ANY($1::uuid[])`,
      [reportCohortRunIds],
    )
    await write(
      `/* seedModerationRerunOutcomes:appealRuns */
       INSERT INTO moderation_appeal_resolution_runs (moderation_appeal_id)
       SELECT $1::uuid FROM generate_series(1, $2::integer)`,
      [appeal.id, RERUN_OUTCOME_COHORT_SIZE],
    )
    const { rows: reportBackgroundRuns } = await write<{ id: string }>(
      `/* seedModerationRerunOutcomes:reportBackgroundRuns */
       INSERT INTO moderation_report_judgement_runs (moderation_report_id)
       SELECT $1::uuid FROM generate_series(1, $2::integer)
       RETURNING id`,
      [report.id, RERUN_OUTCOME_BACKGROUND_RUN_COUNT],
    )
    reportRunIds = reportRunIds.concat(reportBackgroundRuns.map(row => row.id))
    await write(
      `/* seedModerationRerunOutcomes:appealBackgroundRuns */
       INSERT INTO moderation_appeal_resolution_runs (moderation_appeal_id)
       SELECT $1::uuid FROM generate_series(1, $2::integer)`,
      [appeal.id, RERUN_OUTCOME_BACKGROUND_RUN_COUNT],
    )
    await write(
      '/* seedModerationRerunOutcomes:analyzeReportRuns */ ANALYZE moderation_report_judgement_runs',
    )
    await write(
      '/* seedModerationRerunOutcomes:analyzeAppealRuns */ ANALYZE moderation_appeal_resolution_runs',
    )
    await write(
      '/* seedModerationRerunOutcomes:analyzeJudgements */ ANALYZE moderation_report_judgements',
    )
    return {
      reportId: report.id,
      appealId: appeal.id,
      appealRequestToken: appeal.ai_draft_request_token,
      reportRunIds,
    }
  } catch (err) {
    await cleanupModerationRerunOutcomes(appeal.id, reportRunIds)
    throw err
  }
}

export async function cleanupModerationRerunOutcomes(
  appealId: string,
  reportRunIds: string[],
): Promise<void> {
  await write(
    `/* cleanupModerationRerunOutcomes:judgements */
     DELETE FROM moderation_report_judgements WHERE run_id = ANY($1::uuid[])`,
    [reportRunIds],
  )
  await write(
    `/* cleanupModerationRerunOutcomes:reportRuns */
     DELETE FROM moderation_report_judgement_runs WHERE id = ANY($1::uuid[])`,
    [reportRunIds],
  )
  await write(
    `/* cleanupModerationRerunOutcomes:appeal */ DELETE FROM moderation_appeals WHERE id = $1::uuid`,
    [appealId],
  )
}
