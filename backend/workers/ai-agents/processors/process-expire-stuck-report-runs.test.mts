import { describe, expect, it } from 'vitest'
import { createAIAgentReportFixture } from '@voucha/test-helpers/ai-agent-worker-fixtures'
import {
  createReportJudgementRun,
  getReportJudgementRunStatus,
  markReportJudgementRunFailed,
} from '@services/moderation-reports/rerun-outcomes'
import { processExpireStuckReportJudgementRuns } from './process-expire-stuck-resolution-runs.mts'

const LATER = () => new Date(Date.now() + 48 * 60 * 60 * 1000)

async function makeActiveRun() {
  const reportId = (await createAIAgentReportFixture()).data.triggering_report_id
  return { reportId, runId: await createReportJudgementRun(reportId) }
}

describe('expire stuck report judgement runs', () => {
  it('expires an old active run that a crash left without a failure marker', async () => {
    const { reportId, runId } = await makeActiveRun()

    const result = await processExpireStuckReportJudgementRuns({ now: LATER(), runIds: [runId] })

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await getReportJudgementRunStatus(reportId, runId)).toBe('expired')
  })

  it('leaves a run younger than the age bound active', async () => {
    const { reportId, runId } = await makeActiveRun()

    await processExpireStuckReportJudgementRuns({ runIds: [runId] })

    expect(await getReportJudgementRunStatus(reportId, runId)).toBe('active')
  })

  it('leaves a run the worker already marked failed unchanged', async () => {
    const { reportId, runId } = await makeActiveRun()
    await markReportJudgementRunFailed(reportId, runId)

    const result = await processExpireStuckReportJudgementRuns({ now: LATER(), runIds: [runId] })

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await getReportJudgementRunStatus(reportId, runId)).toBe('failed')
  })

  it('caps one run at its page budget and the next tick resumes', async () => {
    const first = await makeActiveRun()
    const second = await makeActiveRun()
    const runIds = [first.runId, second.runId]

    const capped = await processExpireStuckReportJudgementRuns({
      now: LATER(),
      runIds,
      limits: { batchSize: 1, maxBatches: 1 },
    })
    expect(capped).toEqual({ deleted: 1, hasMore: true })

    await processExpireStuckReportJudgementRuns({ now: LATER(), runIds })
    expect(await getReportJudgementRunStatus(first.reportId, first.runId)).toBe('expired')
    expect(await getReportJudgementRunStatus(second.reportId, second.runId)).toBe('expired')
  })
})
