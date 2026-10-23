import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost, insertTestModerationReport } from '@voucha/test-helpers'
import { agentCallOperationKey } from '@agents/_shared'
import { eraseOwnedReportReceiptForReplayTest } from '@voucha/test-helpers/entities/ai-retention'
import { updatePostTitleMarkdown } from '@voucha/test-helpers/entities/posts'
import {
  makeAgentModelCaller,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { runReportJudgementAgent } from './run.mts'

describe('report judgement replay after receipt payload erasure', () => {
  it('returns the exact saved result and rejects changed request or operation identity', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-replay-${randomUUID().slice(0, 8)}`,
      title: 'Report replay',
      markdown: 'Post body for paid judgement',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    const callModel = makeAgentModelCaller({
      recommended_action: 'no_action',
      public_response: 'Content looks fine.',
      internal_response: 'No policy violations found.',
    })
    const input = { entityType: 'post' as const, entityId: postId, triggeringReportId: reportId }
    const first = await runReportJudgementAgent(input, TEST_MODEL_SELECTION, callModel)
    expect(first).not.toBeNull()
    expect(callModel).toHaveBeenCalledOnce()

    await eraseOwnedReportReceiptForReplayTest(
      agentCallOperationKey('report-judgement', `post:${postId}:${reportId}:`),
    )
    const replay = await runReportJudgementAgent(input, TEST_MODEL_SELECTION, callModel)
    expect(replay?.judgement.id).toBe(first?.judgement.id)
    expect(callModel).toHaveBeenCalledOnce()

    await expect(
      runReportJudgementAgent(
        input,
        { ...TEST_MODEL_SELECTION, model: 'changed-model' },
        callModel,
      ),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' })
    await expect(
      runReportJudgementAgent(
        { ...input, triggeringReportId: randomUUID(), operationId: `post:${postId}:${reportId}:` },
        TEST_MODEL_SELECTION,
        callModel,
      ),
    ).rejects.toThrow('Judgement operation identity belongs to another request')
    await expect(
      runReportJudgementAgent(
        { ...input, runId: randomUUID(), operationId: `post:${postId}:${reportId}:` },
        TEST_MODEL_SELECTION,
        callModel,
      ),
    ).rejects.toThrow('Judgement operation identity belongs to another request')

    await updatePostTitleMarkdown(postId, 'Changed after paid judgement', 'Changed report input')
    await expect(
      runReportJudgementAgent(input, TEST_MODEL_SELECTION, callModel),
    ).rejects.toMatchObject({
      name: 'UnrecoverableError',
    })
    expect(callModel).toHaveBeenCalledOnce()
  })
})
