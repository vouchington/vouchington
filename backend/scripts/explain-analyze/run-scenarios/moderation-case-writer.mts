import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { getReportResolutionContext } from '@services/moderation-reports/resolution-context'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { MODERATION_CLUSTER_HOT_POST_ID } from '../seed-data/moderation-cluster-pages.mts'
import { seedModerationCaseWriterHistory } from '../seed-data/moderation-case-writer.mts'

/** Read-only witness of the case writer's primary-key predicate and ordering. */
export async function runModerationCaseWriterScenario(): Promise<void> {
  const { rows: reports } = await read<{ id: string; case_id: string }>(
    `/* moderationCaseWriterTarget */ SELECT id, case_id FROM moderation_reports
     WHERE post_id = $1::uuid AND reviewed_at IS NULL AND resolution_action IS NULL
     ORDER BY id DESC LIMIT 1`,
    [MODERATION_CLUSTER_HOT_POST_ID],
  )
  assert.equal(reports.length, 1)
  const caseId = reports[0]!.case_id
  await captureResolutionContext(reports[0]!.id, caseId)
  await seedModerationCaseWriterHistory()
  await captureBulkCaseCandidates(caseId)
  const scenarioId = 'moderation-case-writer-target'
  const queryName = 'moderationCaseWriterTargetLookup'
  registerScenarioContract(scenarioId, {
    forbidSequentialScans: ['moderation_cases'],
    expectations: [
      { kind: 'usesIndexes', indexes: ['moderation_cases_pkey'] },
      { kind: 'maxProcessedRows', relation: 'moderation_cases', max: 1 },
    ],
  })
  await runAndCapture(
    scenarioId,
    async () => {
      const { rows } = await read<{ id: string }>(
        `/* ${queryName} */ SELECT id FROM moderation_cases
         WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[caseId]],
      )
      assert.deepEqual(
        rows.map(row => row.id),
        [caseId],
      )
    },
    undefined,
    queryName,
    { exactCapturedNames: [queryName] },
  )
}

async function captureResolutionContext(reportId: string, caseId: string): Promise<void> {
  const queryName = 'getReportResolutionContext'
  registerScenarioContract('moderation-report-resolution-context', {
    forbidSequentialScans: ['moderation_reports'],
    expectations: [
      { kind: 'usesIndexes', indexes: ['moderation_reports_pkey'] },
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 1 },
    ],
    crossPartition: {
      posts:
        'Report resolution loads its target and optional root by primary key across partitions.',
    },
  })
  await runAndCapture(
    'moderation-report-resolution-context',
    async () => {
      const context = await getReportResolutionContext(reportId)
      assert.equal(context?.case_id, caseId)
      assert.equal(context?.status, 'pending')
    },
    undefined,
    queryName,
    { exactCapturedNames: [queryName] },
  )
}

async function captureBulkCaseCandidates(caseId: string): Promise<void> {
  const queryName = 'moderationCaseWriterBulkCandidates'
  registerScenarioContract('moderation-case-writer-bulk-candidates', {
    forbidSequentialScans: ['moderation_cases', 'moderation_reports'],
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_moderation_cases__post_id'] },
      { kind: 'usesIndexes', indexes: ['idx_moderation_reports__pending_case_id'] },
      { kind: 'maxProcessedRows', relation: 'moderation_cases', max: 2 },
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 1 },
    ],
  })
  await runAndCapture(
    'moderation-case-writer-bulk-candidates',
    async () => {
      const { rows } = await read<{ id: string }>(
        `/* ${queryName} */ SELECT moderation_case.id
         FROM moderation_cases moderation_case
         WHERE moderation_case.post_id = $1::uuid AND EXISTS (
           SELECT 1 FROM moderation_reports report
           WHERE report.case_id = moderation_case.id AND report.reviewed_at IS NULL
         ) ORDER BY moderation_case.id`,
        [MODERATION_CLUSTER_HOT_POST_ID],
      )
      assert.deepEqual(
        rows.map(row => row.id),
        [caseId],
      )
    },
    undefined,
    queryName,
    { exactCapturedNames: [queryName] },
  )
}
