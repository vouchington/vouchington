import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { ai_agents } from '@queues/ai-agents/queues'
import type { ReportJudgementJobData } from '@queues/ai-agents/types'
import { processBackfillReportJudgements } from './process-backfill-report-judgements.mts'

describe('processBackfillReportJudgements', () => {
  it('enqueues a report-judgement job for an entity missing a judgement', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `proc-backfill-${randomUUID().slice(0, 8)}`,
      title: `Proc Backfill Post ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const result = await processBackfillReportJudgements()
    expect(result.enqueued).toBeGreaterThanOrEqual(1)

    const waiting = await readAllQueueJobs(ai_agents)
    const found = waiting.find(
      j => j.name === 'report-judgement' && (j.data as ReportJudgementJobData).entity_id === postId,
    )
    expect(found).toBeDefined()
    expect((found!.data as ReportJudgementJobData).entity_type).toBe('post')
  })
})
