import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getReportJudgementRunResult } from '@services/moderation-reports/judgement-by-id'
import { insertReportJudgement } from '@services/moderation-reports/judgements'
import {
  createReportJudgementRun,
  getReportJudgementRunStatus,
  markReportJudgementRunExpired,
  markReportJudgementRunFailed,
  markReportJudgementRunsFailed,
} from '@services/moderation-reports/rerun-outcomes'
import { runAppealScenarios } from './moderation-rerun-appeals.mts'
import { runModerationRerunRetentionScenarios } from './moderation-rerun-retention.mts'
import { registerModerationRerunScenario as register } from './moderation-rerun-contract.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  cleanupModerationRerunOutcomes,
  seedModerationRerunOutcomes,
} from '../seed-data/moderation-rerun-outcomes.mts'

export async function runModerationRerunOutcomeScenarios(): Promise<void> {
  const fixture = await seedModerationRerunOutcomes()
  const reportRunIds = fixture.reportRunIds
  const { reportId, appealId, appealRequestToken } = fixture
  try {
    register('report-rerun-admission')
    let successfulReportRunId = ''
    await runAndCapture(
      'report-rerun-admission',
      async () => {
        successfulReportRunId = await createReportJudgementRun(reportId)
        reportRunIds.push(successfulReportRunId)
      },
      undefined,
      'createReportJudgementRun',
    )
    assert(successfulReportRunId)

    register('report-rerun-status')
    await runAndCapture(
      'report-rerun-status',
      async () => {
        assert.equal(await getReportJudgementRunStatus(reportId, successfulReportRunId), 'active')
      },
      undefined,
      'getReportJudgementRunStatus',
    )
    register('report-rerun-result')
    await runAndCapture(
      'report-rerun-result',
      async () => {
        assert.deepEqual(await getReportJudgementRunResult(reportId, successfulReportRunId), {
          run_id: successfulReportRunId,
          status: 'active',
          judgement_id: null,
        })
      },
      undefined,
      'getReportJudgementRunResult',
    )

    let judgementId = ''
    const saveJudgement = async () => {
      const judgement = await insertReportJudgement({
        entityType: 'post',
        entityId: seedUuid(20, '05'),
        triggeringReportId: reportId,
        rerunById: seedUuid(0, '01'),
        runId: successfulReportRunId,
        recommendedAction: 'no_action',
        publicResponse: 'No action',
        internalResponse: 'EXPLAIN fixture',
        model: 'explain-fixture',
      })
      judgementId = judgement.id
    }
    const restoreSuccessInput = async () => {
      await write(
        '/* restoreModerationRerunOutcome:judgement */ DELETE FROM moderation_report_judgements WHERE id = $1::uuid',
        [judgementId],
      )
      await write(
        '/* restoreModerationRerunOutcome:run */ UPDATE moderation_report_judgement_runs SET completed_at = NULL WHERE id = $1::uuid',
        [successfulReportRunId],
      )
    }
    for (const [id, queryName] of [
      ['report-rerun-success-insert', 'insertReportJudgement'],
      ['report-rerun-success-complete', 'insertReportJudgement:completeRun'],
    ] as const) {
      register(id)
      await runAndCapture(id, saveJudgement, undefined, queryName, {
        afterCapture: restoreSuccessInput,
      })
    }

    const failedReportRunId = await createReportJudgementRun(reportId)
    reportRunIds.push(failedReportRunId)
    register('report-rerun-failed')
    await runAndCapture(
      'report-rerun-failed',
      async () => {
        await markReportJudgementRunFailed(reportId, failedReportRunId)
        assert.equal(await getReportJudgementRunStatus(reportId, failedReportRunId), 'failed')
      },
      undefined,
      'markReportJudgementRunsFailed',
      {
        afterCapture: () => restoreReportOutcome(failedReportRunId, 'failed_at'),
      },
    )
    for (const batchSize of [10, 30] as const) {
      const batchRunIds = await Promise.all(
        Array.from({ length: batchSize }, () => createReportJudgementRun(reportId)),
      )
      reportRunIds.push(...batchRunIds)
      const scenarioId = `report-rerun-failed-batch-${batchSize}` as const
      register(scenarioId, batchSize * 2)
      // no-mistakes-disable-next-line query-reached-per-item: two fixed batch sizes require separate serialized custom/generic plan captures.
      await runAndCapture(
        scenarioId,
        async () => {
          assert.equal(
            await markReportJudgementRunsFailed(batchRunIds.map(runId => ({ reportId, runId }))),
            batchSize,
          )
        },
        undefined,
        'markReportJudgementRunsFailed',
        { afterCapture: () => restoreReportOutcomes(batchRunIds, 'failed_at') },
      )
    }
    const expiredReportRunId = await createReportJudgementRun(reportId)
    reportRunIds.push(expiredReportRunId)
    register('report-rerun-expired')
    await runAndCapture(
      'report-rerun-expired',
      async () => {
        await markReportJudgementRunExpired(reportId, expiredReportRunId)
        assert.equal(await getReportJudgementRunStatus(reportId, expiredReportRunId), 'expired')
      },
      undefined,
      'markReportJudgementRunExpired',
      {
        afterCapture: () => restoreReportOutcome(expiredReportRunId, 'expired_at'),
      },
    )

    await runAppealScenarios(appealId, appealRequestToken)
    await runModerationRerunRetentionScenarios(reportId, appealId)
  } finally {
    await cleanupModerationRerunOutcomes(appealId, reportRunIds)
  }
}

async function restoreReportOutcome(runId: string, column: 'failed_at' | 'expired_at') {
  if (column === 'failed_at')
    await write(
      '/* restoreModerationRerunOutcome:failed */ UPDATE moderation_report_judgement_runs SET failed_at = NULL WHERE id = $1::uuid',
      [runId],
    )
  else
    await write(
      '/* restoreModerationRerunOutcome:expired */ UPDATE moderation_report_judgement_runs SET expired_at = NULL WHERE id = $1::uuid',
      [runId],
    )
}

async function restoreReportOutcomes(runIds: readonly string[], column: 'failed_at') {
  await write(
    `/* restoreModerationRerunOutcome:failedBatch */ UPDATE moderation_report_judgement_runs SET ${column} = NULL WHERE id = ANY($1::uuid[])`,
    [runIds],
  )
}
