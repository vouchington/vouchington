import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { moderationAiConfig } from '@services/moderation'
import { getLatestJudgementForEntity } from '@services/moderation-reports/judgements'
import { runReportJudgementAgent } from './run.mts'
import { makeReportJudgementModelResponse } from './test-helpers.mts'

describe('runReportJudgementAgent manual reruns', () => {
  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationAiConfig])
  })

  it('saves the context loaded before the model call', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const laterReporter = await createTestUser()
    const rerunUser = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-rerun-context-${randomUUID().slice(0, 8)}`,
      title: `RJA Rerun Context ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    const callModel = vi.fn<(input: string, entityId: string) => Promise<unknown>>(async () => {
      await insertTestModerationReport({
        reporterUserId: laterReporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'illegal_content',
      })
      return makeReportJudgementModelResponse({
        recommended_action: 'warn',
        public_response: 'Warning issued.',
        internal_response: 'Manual rerun.',
      })
    })

    await runReportJudgementAgent(
      {
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: rerunUser.id,
      },
      callModel,
    )

    const judgement = await getLatestJudgementForEntity('post', postId)
    expect(judgement!.rerun_by_id).toBe(rerunUser.id)
    expect(judgement!.context_report_count).toBe(1)
  })

  it('bypasses the community judgement flag', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const rerunUser = await createTestUser()
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `RJA Comm Rerun ${randomUUID().slice(0, 8)}`,
      slug: `rja-comm-rerun-${randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-comm-rerun-post-${randomUUID().slice(0, 8)}`,
      title: `RJA Comm Rerun Post ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    const callModel = vi.fn<(input: string, entityId: string) => Promise<unknown>>(() =>
      Promise.resolve(
        makeReportJudgementModelResponse({
          recommended_action: 'warn',
          public_response: 'Warning issued.',
          internal_response: 'Manual rerun.',
        }),
      ),
    )

    await runReportJudgementAgent(
      {
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: rerunUser.id,
      },
      callModel,
    )

    expect(callModel).toHaveBeenCalledOnce()
    const judgement = await getLatestJudgementForEntity('post', postId)
    expect(judgement!.rerun_by_id).toBe(rerunUser.id)
  })
})
