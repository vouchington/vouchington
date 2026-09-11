import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import type { ReportJudgementJobData } from '@queues/ai-agents/types'
import { processReportJudgement } from './process-report-judgement.mts'

function makeJob(data: ReportJudgementJobData): Job<ReportJudgementJobData> {
  return { data } as Job<ReportJudgementJobData>
}

describe('processReportJudgement', () => {
  it('runs the agent and reports success (entity-missing path skips the model call)', async () => {
    const result = await processReportJudgement(
      makeJob({
        entity_type: 'post',
        entity_id: randomUUID(),
        triggering_report_id: randomUUID(),
        rerun_by_id: null,
      }),
    )

    expect(result).toEqual({ success: true })
  })
})
