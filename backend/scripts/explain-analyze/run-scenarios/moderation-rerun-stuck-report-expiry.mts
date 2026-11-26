import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils'
import { expireStuckReportJudgementRunPage } from '@services/moderation-reports/expire-stuck-runs'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

const COHORT_SIZE = 1_000
const PAGE_SIZE = 10

/** Old active runs beside as many old finished runs: the partial index must skip the finished. */
export async function runStuckReportExpiryScenario(reportId: string): Promise<void> {
  const stuckTimestamp = new Date('2001-04-01T00:00:00.000Z').getTime()
  // Finished runs sort first, so only the partial index keeps the page from walking past them.
  const finishedTimestamp = new Date('2001-03-15T00:00:00.000Z').getTime()
  const stuckIds = Array.from({ length: COHORT_SIZE }, (_, index) =>
    seedUuidAtTimestamp(stuckTimestamp, 16_000_000 + index),
  )
  const finishedIds = Array.from({ length: COHORT_SIZE }, (_, index) =>
    seedUuidAtTimestamp(finishedTimestamp, 17_000_000 + index),
  )
  try {
    await write(
      `/* seedStuckReportExpiry */
       INSERT INTO moderation_report_judgement_runs (id, moderation_report_id, expired_at)
       SELECT owned.id, $2::uuid, CASE WHEN owned.id = ANY($3::uuid[]) THEN now() END
       FROM unnest($1::uuid[]) AS owned(id)`,
      [[...stuckIds, ...finishedIds], reportId, finishedIds],
    )
    await write('/* seedStuckReportExpiry:analyze */ ANALYZE moderation_report_judgement_runs')

    registerScenarioContract('report-stuck-run-expiry', {
      seededRows: { moderation_report_judgement_runs: COHORT_SIZE * 2 },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        { kind: 'maxProcessedRows', relation: 'moderation_report_judgement_runs', max: 30 },
      ],
      forbidSequentialScans: ['moderation_report_judgement_runs'],
    })
    const cutoffId = getMinUuidv7ForDate(new Date('2001-06-01T00:00:00.000Z'))
    await runAndCapture(
      'report-stuck-run-expiry',
      async () => {
        assert.equal(await expireStuckReportJudgementRunPage(cutoffId, PAGE_SIZE), PAGE_SIZE)
      },
      undefined,
      'listStuckReportJudgementRuns',
      {
        afterCapture: async () => {
          await write(
            `/* restoreStuckReportExpiry */
             UPDATE moderation_report_judgement_runs SET expired_at = NULL
             WHERE id = ANY($1::uuid[])`,
            [stuckIds],
          )
        },
      },
    )
  } finally {
    await write(
      `/* cleanupStuckReportExpiry */
       DELETE FROM moderation_report_judgement_runs WHERE id = ANY($1::uuid[])`,
      [[...stuckIds, ...finishedIds]],
    )
  }
}
