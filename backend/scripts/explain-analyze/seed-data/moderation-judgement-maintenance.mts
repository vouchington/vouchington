import { write } from '@data-stores/psql'
import { seedUuidAtTimestamp } from './common.mts'

// Defaults from moderation-reports/work-limits.mts.
export const DISPATCH = 200
export const BACKFILL = 500
export const DECISION_INSTANT = new Date('2024-04-15T12:00:00.000Z')
export const BACKFILL_TARGETS = BACKFILL + 1
export const EXCLUDED_BACKFILL_TARGETS = 5
const REPORTED_TARGETS = DISPATCH + 1 + BACKFILL_TARGETS + EXCLUDED_BACKFILL_TARGETS

export async function seedJudgementMaintenanceFixture(fixtureTag: string) {
  const reporterIds = await seedReporters(fixtureTag)
  const targetIds = await seedUsers(fixtureTag)
  const reports = await seedReports(targetIds, reporterIds)
  const dispatchTargets = targetIds.slice(0, DISPATCH + 1)
  const dispatchIds = await seedJudgements(dispatchTargets, targetIds, fixtureTag, reporterIds[0]!)
  return { targetIds, reports, dispatchTargets, dispatchIds }
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

async function seedReporters(tag: string): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* seedJudgementMaintenanceReporters */
    INSERT INTO users (username) VALUES ($1 || '-reporter-1'), ($1 || '-reporter-2')
    RETURNING id`,
    [tag],
  )
  return rows.map(row => row.id)
}

async function seedReports(targetIds: string[], reporterIds: string[]) {
  const { rows } = await write<{ entityId: string; id: string }>(
    `/* seedJudgementMaintenanceReports */
    WITH cases AS (
      INSERT INTO moderation_cases (reported_user_id)
      SELECT id FROM unnest($1::uuid[]) target(id) RETURNING id, reported_user_id
    )
    INSERT INTO moderation_reports (created_via, reporter_user_id, reported_user_id, case_id, reason, original_reason)
    SELECT 'system', reporters.id, cases.reported_user_id, cases.id, 'spam', 'spam'
    FROM cases CROSS JOIN unnest($2::uuid[]) reporters(id)
    RETURNING reported_user_id AS "entityId", id`,
    [targetIds, reporterIds],
  )
  return rows
}

async function seedJudgements(
  dispatchTargets: string[],
  targetIds: string[],
  fixtureTag: string,
  rerunById: string,
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
    ...targetIds.slice(-EXCLUDED_BACKFILL_TARGETS, -1),
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
      rerunById,
    ],
  )
  return dispatchIds
}
