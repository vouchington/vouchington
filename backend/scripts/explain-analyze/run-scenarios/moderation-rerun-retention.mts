import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  cleanupAppealResolutionRuns,
  cleanupReportJudgementRuns,
} from '@services/data-retention/cleanup-ai-rerun-outcomes'
import { getRetentionCutoffDate } from '@services/data-retention/cleanup-options'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

const COHORT_SIZE = 1_000
const PAGE_SIZE = 10
type RunRelation = 'moderation_report_judgement_runs' | 'moderation_appeal_resolution_runs'

export async function runModerationRerunRetentionScenarios(
  reportId: string,
  appealId: string,
): Promise<void> {
  const now = new Date('2001-07-01T00:00:00.000Z')
  const oldTimestamp = new Date('2001-03-01T00:00:00.000Z').getTime()
  const reportIds = Array.from({ length: COHORT_SIZE }, (_, index) =>
    seedUuidAtTimestamp(oldTimestamp, 12_000_000 + index),
  )
  const appealIds = Array.from({ length: COHORT_SIZE }, (_, index) =>
    seedUuidAtTimestamp(oldTimestamp, 13_000_000 + index),
  )
  try {
    await write(
      `/* seedModerationRerunRetention:reports */
       INSERT INTO moderation_report_judgement_runs (id, moderation_report_id)
       SELECT owned.id, $2::uuid FROM unnest($1::uuid[]) AS owned(id)`,
      [reportIds, reportId],
    )
    await write(
      `/* seedModerationRerunRetention:appeals */
       INSERT INTO moderation_appeal_resolution_runs (id, moderation_appeal_id)
       SELECT owned.id, $2::uuid FROM unnest($1::uuid[]) AS owned(id)`,
      [appealIds, appealId],
    )
    await write(
      '/* seedModerationRerunRetention:analyzeReports */ ANALYZE moderation_report_judgement_runs',
    )
    await write(
      '/* seedModerationRerunRetention:analyzeAppeals */ ANALYZE moderation_appeal_resolution_runs',
    )

    const cutoffId = getMinUUIDv7ForDate(getRetentionCutoffDate(90, now))
    await assertOwnedEligibleRows('moderation_report_judgement_runs', cutoffId, reportIds)
    await assertOwnedEligibleRows('moderation_appeal_resolution_runs', cutoffId, appealIds)
    await runRetentionScenario({
      id: 'report-rerun-retention',
      relation: 'moderation_report_judgement_runs',
      queryName: 'deleteOldReportJudgementRunBatch',
      ids: reportIds,
      parentId: reportId,
      now,
      cleanup: cleanupReportJudgementRuns,
    })
    await runRetentionScenario({
      id: 'appeal-rerun-retention',
      relation: 'moderation_appeal_resolution_runs',
      queryName: 'deleteOldAppealResolutionRunBatch',
      ids: appealIds,
      parentId: appealId,
      now,
      cleanup: cleanupAppealResolutionRuns,
    })
  } finally {
    await write(
      `/* cleanupModerationRerunRetention:reports */
       DELETE FROM moderation_report_judgement_runs WHERE id = ANY($1::uuid[])`,
      [reportIds],
    )
    await write(
      `/* cleanupModerationRerunRetention:appeals */
       DELETE FROM moderation_appeal_resolution_runs WHERE id = ANY($1::uuid[])`,
      [appealIds],
    )
  }
}

async function assertOwnedEligibleRows(
  relation: RunRelation,
  cutoffId: string,
  ids: readonly string[],
): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* assertModerationRerunRetentionOwnership */
     SELECT id FROM ${relation} WHERE id < $1::uuid ORDER BY id LIMIT ${COHORT_SIZE + 1}`,
    [cutoffId],
  )
  assert.deepEqual(
    rows.map(row => row.id),
    ids.toSorted(),
  )
}

async function runRetentionScenario(scenario: {
  id: 'report-rerun-retention' | 'appeal-rerun-retention'
  relation: RunRelation
  queryName: string
  ids: readonly string[]
  parentId: string
  now: Date
  cleanup: typeof cleanupReportJudgementRuns
}): Promise<void> {
  registerScenarioContract(scenario.id, {
    seededRows: { [scenario.relation]: COHORT_SIZE },
    expectations: [
      { kind: 'queryBinds', token: 'LIMIT' },
      { kind: 'maxProcessedRows', relation: scenario.relation, max: 30 },
    ],
    forbidSequentialScans: [scenario.relation],
  })
  await runAndCapture(
    scenario.id,
    async () => {
      const result = await scenario.cleanup({
        now: scenario.now,
        maxBatches: 1,
        batchSize: PAGE_SIZE,
      })
      assert.deepEqual(result, { deleted: PAGE_SIZE, hasMore: true })
    },
    undefined,
    scenario.queryName,
    {
      afterCapture: () =>
        restorePage(scenario.relation, scenario.parentId, scenario.ids.slice(0, PAGE_SIZE)),
    },
  )
}

async function restorePage(relation: string, parentId: string, ids: readonly string[]) {
  if (relation === 'moderation_report_judgement_runs') {
    await write(
      `/* restoreModerationRerunRetention:reports */
       INSERT INTO moderation_report_judgement_runs (id, moderation_report_id)
       SELECT owned.id, $2::uuid FROM unnest($1::uuid[]) AS owned(id)`,
      [ids, parentId],
    )
  } else {
    await write(
      `/* restoreModerationRerunRetention:appeals */
       INSERT INTO moderation_appeal_resolution_runs (id, moderation_appeal_id)
       SELECT owned.id, $2::uuid FROM unnest($1::uuid[]) AS owned(id)`,
      [ids, parentId],
    )
  }
}
