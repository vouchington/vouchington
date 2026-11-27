import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getUndispatchedJudgements } from '@services/moderation-reports/dispatch-state'
import { moderationReportsWorkConfig } from '@services/moderation-reports/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

// Defaults from moderation-reports/work-limits.mts.
const DISPATCH = 200
const DECISION_INSTANT = new Date('2024-04-15T12:00:00.000Z')
const EXCLUDED_DISPATCH_TARGETS = 5
const REPORTED_TARGETS = DISPATCH + 1 + EXCLUDED_DISPATCH_TARGETS

export async function runModerationJudgementMaintenanceScenarios(): Promise<void> {
  const fixtureTag = `explain-judgements-${randomUUID()}`
  const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
    dispatch_batch_size: DISPATCH,
    dispatch_min_age_seconds: 120,
    dispatch_max_age_seconds: 1800,
  })
  try {
    const targetIds = await seedUsers(fixtureTag)
    await seedReports(targetIds)
    const dispatchTargets = targetIds.slice(0, DISPATCH + 1)
    const dispatchIds = await seedJudgements(dispatchTargets, targetIds, fixtureTag)
    await write(
      '/* analyzeJudgementMaintenance */ ANALYZE moderation_reports, moderation_report_judgements, users',
    )
    await captureDispatch(dispatchTargets, dispatchIds)
  } finally {
    restore()
    await write('/* cleanupJudgementMaintenanceUsers */ DELETE FROM users WHERE username LIKE $1', [
      `${fixtureTag}-%`,
    ])
  }
}

async function seedUsers(tag: string): Promise<string[]> {
  const { rows } = await write<{ id: string; username: string }>(
    `/* seedJudgementMaintenanceUsers */
    INSERT INTO users (username, deleted_at)
    SELECT $1 || '-' || lpad(n::text, 4, '0'),
      CASE WHEN n = $3 THEN CURRENT_TIMESTAMP END
    FROM generate_series(1, $2::int) n RETURNING id, username`,
    [tag, REPORTED_TARGETS, REPORTED_TARGETS],
  )
  return rows.toSorted((a, b) => a.username.localeCompare(b.username)).map(row => row.id)
}

async function seedReports(targetIds: string[]) {
  await write(
    `/* seedJudgementMaintenanceReports */
    WITH cases AS (
      INSERT INTO moderation_cases (reported_user_id)
      SELECT id FROM unnest($1::uuid[]) target(id) RETURNING id, reported_user_id
    )
    INSERT INTO moderation_reports (created_via, reporter_user_id, reported_user_id, case_id, reason, original_reason)
    SELECT 'system', reporters.id, cases.reported_user_id, cases.id, 'spam', 'spam'
    FROM cases CROSS JOIN unnest($2::uuid[]) reporters(id)`,
    [targetIds, [seedUuid(1, '01'), seedUuid(2, '01')]],
  )
}

async function seedJudgements(
  dispatchTargets: string[],
  targetIds: string[],
  fixtureTag: string,
): Promise<string[]> {
  const now = DECISION_INSTANT.getTime()
  const dispatchIds = dispatchTargets.map((_, index) =>
    seedUuidAtTimestamp(now - 15 * 60000, index),
  )
  const excludedIds = [45 * 60000, 60000, 15 * 60000, 15 * 60000].map((age, index) =>
    seedUuidAtTimestamp(now - age, DISPATCH + 1 + index),
  )
  const ineligibleIds = Array.from({ length: 2 * DISPATCH }, (_, index) =>
    seedUuidAtTimestamp(now - 16 * 60000, index),
  )
  const judgementTargets = [
    ...dispatchTargets,
    ...targetIds.slice(-EXCLUDED_DISPATCH_TARGETS, -1),
    ...ineligibleIds.map((_, index) => dispatchTargets[index % dispatchTargets.length]!),
  ]
  await write(
    `/* seedJudgementMaintenanceJudgements */
    INSERT INTO moderation_report_judgements
      (id, reported_user_id, recommended_action, public_response, internal_response, model, dispatched_at, rerun_by_id)
    SELECT input.id, input.target, 'no_action', 'EXPLAIN', 'EXPLAIN', $3,
      CASE WHEN input.n = $4 + 3 OR (input.n > $4 + 4 AND input.n % 2 = 0)
        THEN CURRENT_TIMESTAMP END,
      CASE WHEN input.n = $4 + 4 OR (input.n > $4 + 4 AND input.n % 2 = 1)
        THEN $5::uuid END
    FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY input(id, target, n)`,
    [
      [...dispatchIds, ...excludedIds, ...ineligibleIds],
      judgementTargets,
      fixtureTag,
      dispatchIds.length,
      seedUuid(1, '01'),
    ],
  )
  return dispatchIds
}

async function captureDispatch(dispatchTargets: string[], dispatchIds: string[]) {
  const scenario = 'moderation-undispatched-judgements-at-cap'
  const query = 'getUndispatchedJudgements'
  registerScenarioContract(scenario, {
    expectations: [
      // A bitmap path can inspect and sort the full 201-row eligible window.
      { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: DISPATCH + 1 },
      { kind: 'maxInputRows', nodeType: 'Sort', max: DISPATCH + 1 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      assert.deepEqual(
        await getUndispatchedJudgements(),
        dispatchIds.slice(0, DISPATCH).map((judgement_id, index) => ({
          judgement_id,
          entity_type: 'user',
          entity_id: dispatchTargets[index],
          community_id: null,
        })),
      )
    },
    undefined,
    query,
    { decisionInstant: DECISION_INSTANT, exactCapturedNames: [query] },
  )
}
