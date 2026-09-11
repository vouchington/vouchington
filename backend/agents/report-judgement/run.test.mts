import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestPost,
  insertTestCommunity,
  insertTestModerationReport,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { getLatestJudgementForEntity } from '@services/moderation-reports/judgements'
import { moderationAiConfig } from '@services/moderation'
import { runReportJudgementAgent } from './run.mts'
import { makeReportJudgementModelCaller } from './test-helpers.mts'

describe('runReportJudgementAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationAiConfig])
  })

  it('inserts a judgement for a valid post entity', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-valid-${randomUUID().slice(0, 8)}`,
      title: `RJA Valid ${randomUUID().slice(0, 8)}`,
      markdown: 'Post body for judgement agent',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    const callModel = makeReportJudgementModelCaller({
      recommended_action: 'no_action',
      public_response: 'Content looks fine.',
      internal_response: 'No policy violations found.',
    })

    await runReportJudgementAgent(
      { entityType: 'post', entityId: postId, triggeringReportId: reportId, rerunById: null },
      callModel,
    )

    expect(callModel).toHaveBeenCalledOnce()
    expect(callModel.mock.calls[0][0]).toContain('Reason: spam')
    const judgement = await getLatestJudgementForEntity('post', postId)
    expect(judgement).not.toBeNull()
    expect(judgement!.recommended_action).toBe('no_action')
    expect(judgement!.public_response).toBe('Content looks fine.')
    expect(judgement!.internal_response).toBe('No policy violations found.')
    expect(judgement!.triggering_report_id).toBe(reportId)
  })

  it('passes rerunById through to the inserted judgement', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const rerunUser = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-rerun-${randomUUID().slice(0, 8)}`,
      title: `RJA Rerun ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
    })

    await runReportJudgementAgent(
      {
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: rerunUser.id,
      },
      makeReportJudgementModelCaller({
        recommended_action: 'warn',
        public_response: 'Warning issued.',
        internal_response: 'Borderline content.',
      }),
    )

    const judgement = await getLatestJudgementForEntity('post', postId)
    expect(judgement!.rerun_by_id).toBe(rerunUser.id)
    expect(judgement!.recommended_action).toBe('warn')
  })

  it('judges a community post (with rules) when community judgement is enabled', async () => {
    await moderationAiConfig.waitForInitialization()
    overrideDynamicConfigFieldsForTest(moderationAiConfig, { community_judgement_enabled: true })
    try {
      const author = await createTestUser()
      const reporter = await createTestUser()
      const community = await insertTestCommunity({
        createdById: author.id,
        name: `RJA Comm On ${randomUUID().slice(0, 8)}`,
        slug: `rja-comm-on-${randomUUID().slice(0, 8)}`,
        rules_markdown: 'Be kind. No spam.',
      })
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `rja-comm-on-post-${randomUUID().slice(0, 8)}`,
        title: `RJA Comm On Post ${randomUUID().slice(0, 8)}`,
        markdown: 'community body',
        communityId: community.id,
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
      })

      const callModel = makeReportJudgementModelCaller({
        recommended_action: 'remove',
        public_response: 'Removed for spam.',
        internal_response: 'Violates community rules.',
      })

      await runReportJudgementAgent(
        { entityType: 'post', entityId: postId, triggeringReportId: reportId, rerunById: null },
        callModel,
      )

      expect(callModel).toHaveBeenCalledOnce()
      // The model input must include the community rules section.
      expect(callModel.mock.calls[0][0]).toContain('Community Rules')
      const judgement = await getLatestJudgementForEntity('post', postId)
      expect(judgement!.recommended_action).toBe('remove')
    } finally {
      overrideDynamicConfigFieldsForTest(moderationAiConfig, { community_judgement_enabled: false })
    }
  })

  it('skips community posts when community judgement is disabled by default', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `RJA Comm ${randomUUID().slice(0, 8)}`,
      slug: `rja-comm-${randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-comm-post-${randomUUID().slice(0, 8)}`,
      title: `RJA Comm Post ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    const callModel = makeReportJudgementModelCaller({
      recommended_action: 'no_action',
      public_response: 'ok',
      internal_response: 'ok',
    })

    await runReportJudgementAgent(
      { entityType: 'post', entityId: postId, triggeringReportId: reportId, rerunById: null },
      callModel,
    )

    // Community judgement is disabled by default → the agent skips before calling the model.
    expect(callModel).not.toHaveBeenCalled()
  })

  it('returns early without calling the model when the entity does not exist', async () => {
    const callModel = makeReportJudgementModelCaller({
      recommended_action: 'no_action',
      public_response: 'x',
      internal_response: 'x',
    })

    await runReportJudgementAgent(
      {
        entityType: 'post',
        entityId: randomUUID(),
        triggeringReportId: randomUUID(),
        rerunById: null,
      },
      callModel,
    )

    expect(callModel).not.toHaveBeenCalled()
  })

  it('throws when the model returns an invalid response shape', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-invalid-${randomUUID().slice(0, 8)}`,
      title: `RJA Invalid ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    await expect(
      runReportJudgementAgent(
        { entityType: 'post', entityId: postId, triggeringReportId: reportId, rerunById: null },
        makeReportJudgementModelCaller({
          recommended_action: 'INVALID',
          public_response: 'x',
          internal_response: 'x',
        }),
      ),
    ).rejects.toThrow(TypeError)
  })

  it('skips the model call when the latest automatic judgement matches current context', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-idem-${randomUUID().slice(0, 8)}`,
      title: `RJA Idempotent ${randomUUID().slice(0, 8)}`,
      markdown: 'idempotency body',
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

    const secondCall = makeReportJudgementModelCaller({
      recommended_action: 'warn',
      public_response: 'second',
      internal_response: 'second',
    })
    await runReportJudgementAgent(
      { entityType: 'post', entityId: postId, triggeringReportId: reportId, rerunById: null },
      secondCall,
    )
    expect(secondCall).not.toHaveBeenCalled()
    const second = await getLatestJudgementForEntity('post', postId)
    expect(second!.id).toBe(first!.id)
  })
})
