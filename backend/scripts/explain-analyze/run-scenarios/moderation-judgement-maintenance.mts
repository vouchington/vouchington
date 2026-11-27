import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getUndispatchedJudgements } from '@services/moderation-reports/dispatch-state'
import { streamEntitiesMissingJudgementBatches } from '@services/moderation-reports/judgements-backfill'
import { moderationReportsWorkConfig } from '@services/moderation-reports/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  BACKFILL,
  BACKFILL_TARGETS,
  DECISION_INSTANT,
  DISPATCH,
  EXCLUDED_BACKFILL_TARGETS,
  seedJudgementMaintenanceFixture,
} from '../seed-data/moderation-judgement-maintenance.mts'
import { registerModerationJudgementBackfillPlan } from './moderation-judgement-backfill-plan.mts'

export async function runModerationJudgementMaintenanceScenarios(): Promise<void> {
  const fixtureTag = `explain-judgements-${randomUUID()}`
  const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
    dispatch_batch_size: DISPATCH,
    dispatch_min_age_seconds: 120,
    dispatch_max_age_seconds: 1800,
    backfill_batch_size: BACKFILL,
  })
  try {
    const { targetIds, reports, dispatchTargets, dispatchIds } =
      await seedJudgementMaintenanceFixture(fixtureTag)
    await write(
      '/* analyzeJudgementMaintenance */ ANALYZE moderation_reports, moderation_report_judgements, users',
    )
    await captureDispatch(dispatchTargets, dispatchIds)
    await captureBackfill(targetIds, reports)
  } finally {
    restore()
    await write(
      `/* cleanupJudgementMaintenanceUsers */
      WITH removed AS (DELETE FROM users WHERE username LIKE $1 RETURNING id)
      DELETE FROM retained_user_identities WHERE id IN (SELECT id FROM removed)`,
      [`${fixtureTag}-%`],
    )
  }
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

async function captureBackfill(
  targetIds: string[],
  reports: Awaited<ReturnType<typeof seedJudgementMaintenanceFixture>>['reports'],
) {
  const scenario = 'moderation-missing-judgements-backfill-at-cap'
  const query = 'streamEntitiesMissingJudgementBatches'
  const eligible = new Set(targetIds.slice(DISPATCH + 1, -EXCLUDED_BACKFILL_TARGETS))
  const latest = new Map<string, string>()
  for (const { entityId, id } of reports) {
    if (eligible.has(entityId) && id > (latest.get(entityId) ?? '')) latest.set(entityId, id)
  }
  assert.equal(latest.size, BACKFILL_TARGETS)
  const expected = Array.from(latest, ([entityId, triggeringReportId]) => ({
    entityId,
    entityType: 'user',
    triggeringReportId,
  })).toSorted((a, b) => a.entityId.localeCompare(b.entityId))
  await registerModerationJudgementBackfillPlan(scenario)
  const owned = new Set(targetIds)
  await runAndCapture(
    scenario,
    async () => {
      const actual: typeof expected = []
      let lastBatchSize = BACKFILL
      for await (const batch of streamEntitiesMissingJudgementBatches()) {
        assert.equal(lastBatchSize, BACKFILL)
        assert.ok(batch.length > 0 && batch.length <= BACKFILL)
        actual.push(...batch.filter(row => owned.has(row.entityId)))
        lastBatchSize = batch.length
      }
      assert.deepEqual(
        actual.toSorted((a, b) => a.entityId.localeCompare(b.entityId)),
        expected,
      )
    },
    undefined,
    query,
    { exactCapturedNames: [query] },
  )
}
