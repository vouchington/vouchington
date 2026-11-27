import { describe, it, expect } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import type { ReportJudgementJobData } from '@queues/ai-agents/types'
import { moderationReportsWorkConfig } from '@services/moderation-reports/work-limits'
import {
  advanceJudgementBackfillCursor,
  readJudgementBackfillCursor,
} from '@services/moderation-reports/judgement-backfill-cursor'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { withTestJudgementBackfillRun } from '@voucha/test-helpers/report-judgement-backfill-fixture'
import { processAIAgent } from '../processors.mts'

async function readFixtureJobs(postIds: readonly string[]) {
  const jobs = await readAllQueueJobs(ai_agents)
  return jobs
    .flatMap(job => {
      const data = job.data as ReportJudgementJobData
      return job.name === 'report-judgement' && postIds.includes(data.entity_id)
        ? [{ postId: data.entity_id, reportId: data.triggering_report_id }]
        : []
    })
    .toSorted((left, right) => left.postId.localeCompare(right.postId))
}

describe('processBackfillReportJudgements', () => {
  it('stops at the run cap and reads the persisted continuation on the next run', async () => {
    const run = () =>
      processAIAgent({
        name: 'backfill_report_judgements',
        data: {},
      } as Parameters<typeof processAIAgent>[0])
    const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
      backfill_batch_size: 1,
      backfill_max_batches_per_run: 2,
    })
    try {
      await withTestJudgementBackfillRun(async (postIds, reportIds) => {
        const startingCursor = await readJudgementBackfillCursor()
        const expected = postIds.map((postId, index) => ({ postId, reportId: reportIds[index] }))
        expect(await run()).toEqual({ enqueued: 2, hasMore: true })
        expect(await readFixtureJobs(postIds)).toEqual(expected.slice(0, 2))
        expect(await readJudgementBackfillCursor()).toMatchObject({
          target_kind: 'post',
          cursor_target_id: postIds[1],
        })
        expect(await advanceJudgementBackfillCursor(startingCursor, startingCursor)).toBe(false)

        expect(await run()).toEqual({ enqueued: 2, hasMore: true })
        expect(await readFixtureJobs(postIds)).toEqual(expected)
      })
    } finally {
      restore()
    }
  })
})
