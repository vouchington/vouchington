import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { assertMutableSortCursorIsCurrent } from '@services/moderation-reports/sort-sql'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const SCENARIO = 'moderation-report-order-cursor-at-cap'
const QUERY = 'getModerationReportCursorSortKeys'

async function seedCursorReport(targetUserId: string) {
  const { rows } = await write<{ id: string; report_rows: number; judgement_rows: number }>(
    `/* seedModerationReportOrderCursor */
    WITH target_user AS (
      INSERT INTO users (id, username) VALUES ($1, $2) RETURNING id
    ), target_case AS (
      INSERT INTO moderation_cases (reported_user_id)
      SELECT id FROM target_user RETURNING id, reported_user_id
    ), reporters AS (
      (SELECT id, FALSE AS system_generated FROM users
        WHERE username LIKE 'seeduser%' ORDER BY id LIMIT 7)
      UNION ALL
      SELECT id, TRUE FROM users WHERE username = $3
    ), ranked AS (
      SELECT id, system_generated, row_number() OVER (ORDER BY system_generated, id) AS n FROM reporters
    ), inserted AS (
      INSERT INTO moderation_reports (reporter_user_id, reported_user_id, case_id, created_via, reason,
        original_reason, reviewed_at, resolution_action)
      SELECT reporter.id, target_case.reported_user_id, target_case.id,
        CASE WHEN reporter.system_generated THEN 'system'::content_creation_channels ELSE 'api' END,
        'spam', 'spam', CASE WHEN reporter.n = 7 THEN CURRENT_TIMESTAMP END,
        CASE WHEN reporter.n = 7 THEN 'dismissed'::moderation_report_resolution_actions END
      FROM ranked reporter CROSS JOIN target_case
      RETURNING id, reporter_user_id
    )
    SELECT inserted.id,
      ((SELECT count(*) FROM moderation_reports) + (SELECT count(*) FROM inserted))::int AS report_rows,
      (SELECT count(*)::int FROM moderation_report_judgements) AS judgement_rows
    FROM inserted JOIN ranked reporter ON reporter.id = inserted.reporter_user_id
    WHERE reporter.n = 1`,
    [targetUserId, `explain-report-${targetUserId.slice(0, 12)}`, BAN_EVASION_SYSTEM_USERNAME],
  )
  return rows[0]!
}

export async function runModerationReportOrderCursorCapacity(): Promise<void> {
  const targetUserId = randomUUID()
  try {
    const { id, report_rows, judgement_rows } = await seedCursorReport(targetUserId)
    registerScenarioContract(SCENARIO, {
      // Main can scan each history once in addition to fetching the cursor report by ID.
      // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7189010536
      expectations: [
        { kind: 'maxProcessedRows', relation: 'moderation_reports', max: report_rows + 1 },
        { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: judgement_rows },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        await assertMutableSortCursorIsCurrent(
          { id, reportCount: 7, severityRank: 0 },
          'severity',
          'pending',
        )
        await assertMutableSortCursorIsCurrent({ id, reportCount: 6 }, 'most_reported', 'pending', {
          excludeSystemGenerated: true,
        })
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY, QUERY] },
    )
    await assert.rejects(
      assertMutableSortCursorIsCurrent({ id, reportCount: 7 }, 'most_reported', 'pending', {
        excludeSystemGenerated: true,
      }),
      { status: 422 },
    )
  } finally {
    await write(
      '/* cleanupModerationReportOrderCursorCase */ DELETE FROM moderation_cases WHERE reported_user_id = $1',
      [targetUserId],
    )
    await write('/* cleanupModerationReportOrderCursorUser */ DELETE FROM users WHERE id = $1', [
      targetUserId,
    ])
  }
}
