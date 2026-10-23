import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import type { ReportJudgementJobData } from '@queues/ai-agents/types'
import { ai_agents } from '@queues/ai-agents/queues'
import { runReportJudgementAgent } from '@agents/report-judgement'
import { loadServiceModelSelection } from '@services/ai-usage'
import { moderationAiConfig } from '@services/moderation-ai-config'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  insertTestModerationReport,
} from '@voucha/test-helpers'
import { makeAgentModelCaller } from '@voucha/test-helpers/agents/model-call-result'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { processReportJudgement } from './process-report-judgement.mts'

function makeJob(data: ReportJudgementJobData): Job<ReportJudgementJobData> {
  return { data } as Job<ReportJudgementJobData>
}

describe('processReportJudgement', () => {
  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationAiConfig])
  })
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

  it('replays a saved community judgement through the processor after the enqueue window', async () => {
    await moderationAiConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(moderationAiConfig, {
      community_judgement_enabled: true,
    })
    try {
      const author = await createTestUser()
      const reporter = await createTestUser()
      const community = await insertTestCommunity({
        createdById: author.id,
        name: `Replay ${randomUUID()}`,
        slug: `replay-${randomUUID()}`,
      })
      const postId = await insertTestPost({
        createdById: author.id,
        communityId: community.id,
        title: 'Community judgement replay',
        slug: `community-replay-${randomUUID()}`,
        markdown: 'Post body for replay',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
      })
      const operationId = `post:${postId}:${reportId}`
      const selection = await loadServiceModelSelection('report-judgement')
      const callModel = makeAgentModelCaller({
        recommended_action: 'escalate',
        public_response: 'Escalate.',
        internal_response: 'Community review needed.',
      })
      // Persist the judgement, then simulate interruption before the processor enqueues dispatch.
      const saved = await runReportJudgementAgent(
        {
          entityType: 'post',
          entityId: postId,
          triggeringReportId: reportId,
          rerunById: null,
          operationId,
        },
        selection,
        callModel,
      )
      expect(saved?.judgement.id).toBeDefined()

      await expect(
        processReportJudgement(
          makeJob({
            entity_type: 'post',
            entity_id: postId,
            triggering_report_id: reportId,
            rerun_by_id: null,
            run_id: null,
          }),
          callModel,
        ),
      ).resolves.toEqual({ success: true })
      expect(callModel).toHaveBeenCalledOnce()
      const enqueued = await ai_agents.searchJobs({
        name: 'auto-dispatch-judgement',
        data: { judgement_id: saved!.judgement.id },
      })
      expect(enqueued).toHaveLength(1)
      expect(enqueued[0]?.data).toMatchObject({
        judgement_id: saved!.judgement.id,
        community_id: community.id,
      })
    } finally {
      restore()
    }
  })
})
