import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { getLatestJudgementForEntity } from '@services/moderation-reports/judgements'
import { runReportJudgementAgent } from './run.mts'
import { makeReportJudgementModelCaller } from './test-helpers.mts'

describe('runReportJudgementAgent refresh', () => {
  it('runs again when the latest automatic judgement is stale for the current context', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const secondReporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-stale-${randomUUID().slice(0, 8)}`,
      title: `RJA Stale ${randomUUID().slice(0, 8)}`,
      markdown: 'stale body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    await runReportJudgementAgent(
      { entityType: 'post', entityId: postId, triggeringReportId: reportId, rerunById: null },
      makeReportJudgementModelCaller({
        recommended_action: 'no_action',
        public_response: 'ok',
        internal_response: 'ok',
      }),
    )
    const first = await getLatestJudgementForEntity('post', postId)
    expect(first).not.toBeNull()

    const secondReportId = await insertTestModerationReport({
      reporterUserId: secondReporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'illegal_content',
      note: 'new context',
    })
    const secondCall = makeReportJudgementModelCaller({
      recommended_action: 'escalate',
      public_response: 'second',
      internal_response: 'second',
    })
    await runReportJudgementAgent(
      {
        entityType: 'post',
        entityId: postId,
        triggeringReportId: secondReportId,
        rerunById: null,
      },
      secondCall,
    )

    expect(secondCall).toHaveBeenCalledOnce()
    const second = await getLatestJudgementForEntity('post', postId)
    expect(second!.id).not.toBe(first!.id)
    expect(second!.recommended_action).toBe('escalate')
    expect(second!.context_report_count).toBe(2)
  })
})
