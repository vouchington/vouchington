import { streamEntitiesMissingJudgementBatches } from '@services/moderation-reports/judgements-backfill'
import { enqueueBulkReportJudgements } from '@queues/ai-agents/enqueues/report-judgement'

export async function processBackfillReportJudgements(): Promise<{ enqueued: number }> {
  let enqueued = 0
  for await (const batch of streamEntitiesMissingJudgementBatches()) {
    await enqueueBulkReportJudgements(batch)
    enqueued += batch.length
  }
  return { enqueued }
}
