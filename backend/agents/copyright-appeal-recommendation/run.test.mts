import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  makeAgentModelCaller,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createCopyrightAppeal, createCopyrightFormIntake } from '@services/copyright-notices'
import { parseCopyrightAppealRecommendationOutput } from './output.mts'
import { admitCopyrightAppealRecommendationRun } from '@services/copyright-notices/appeal-recommendation-runs'
import { runCopyrightAppealRecommendationAgent } from './run.mts'
import {
  COPYRIGHT_AI_RUN_TABLES,
  createCopyrightCaseWithAiRunSubjects,
  insertTestCopyrightAiRun,
  readTestCopyrightAiRun,
} from '@voucha/test-helpers/copyright-ai-run-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright appeal recommendation output', () => {
  it('accepts bounded advice without an action', () => {
    expect(
      parseCopyrightAppealRecommendationOutput({
        recommendation: 'uncertain',
        rationale: 'A moderator should review.',
      }),
    ).toEqual({ recommendation: 'uncertain', rationale: 'A moderator should review.' })
  })

  it('rejects unsupported or unbounded model output', () => {
    expect(() =>
      parseCopyrightAppealRecommendationOutput({
        recommendation: 'takedown',
        rationale: 'Take action.',
      }),
    ).toThrow('Invalid copyright appeal recommendation output')
    expect(() =>
      parseCopyrightAppealRecommendationOutput({
        recommendation: 'uncertain',
        rationale: 'x'.repeat(10_001),
      }),
    ).toThrow('Invalid copyright appeal recommendation output')
  })

  it('records a model recommendation against a persisted appeal', async () => {
    const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await insertTestPost({
      title: `appeal agent ${randomUUID()}`,
      slug: `appeal-agent-${randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const intake = await createCopyrightFormIntake({
      currentUser: claimant,
      requesterIdentity: `user:${claimant.id}`,
      idempotencyKey: randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'A photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: [
          {
            surfaceKind: 'post-image' as const,
            postId,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
      },
    })
    const targetId = (await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id))
      ?.targets[0]?.id
    if (!targetId) throw new Error('copyright target missing')
    const appeal = await createCopyrightAppeal(
      poster,
      intake.intake.copyright_notice_id,
      randomUUID(),
      { reason: 'I created this image.', targetIds: [targetId] },
    )
    const callModel = makeAgentModelCaller({
      recommendation: 'reverse',
      rationale: 'Moderator review is required.',
    })

    const runId = (await admitCopyrightAppealRecommendationRun(appeal.submission.id))!
    await expect(
      runCopyrightAppealRecommendationAgent(
        appeal.submission.id,
        runId,
        TEST_MODEL_SELECTION,
        callModel,
      ),
    ).resolves.toBe('reverse')
    expect(callModel).toHaveBeenCalledOnce()
    await expect(
      getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id),
    ).resolves.toMatchObject({
      appealRecommendations: [expect.objectContaining({ recommendation: 'reverse' })],
    })
  })

  it('expires the run when the submission is not an appeal to recommend on', async () => {
    const { counterNoticeSubmissionId } = await createCopyrightCaseWithAiRunSubjects()
    const runId = randomUUID()
    await insertTestCopyrightAiRun(
      COPYRIGHT_AI_RUN_TABLES.appeal,
      'copyright_notice_submission_id',
      counterNoticeSubmissionId,
      runId,
      false,
    )
    const callModel = makeAgentModelCaller({ recommendation: 'reverse', rationale: 'x' })
    await expect(
      runCopyrightAppealRecommendationAgent(
        counterNoticeSubmissionId,
        runId,
        TEST_MODEL_SELECTION,
        callModel,
      ),
    ).resolves.toBeNull()
    expect(callModel).not.toHaveBeenCalled()
    await expect(
      readTestCopyrightAiRun(COPYRIGHT_AI_RUN_TABLES.appeal, runId),
    ).resolves.toMatchObject({ status: 'expired' })
  })
})
