import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createCopyrightAppeal,
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
} from '@services/copyright-notices'
import {
  parseCopyrightAppealRecommendationOutput,
  runCopyrightAppealRecommendationAgent,
} from './run.mts'

describe('copyright appeal recommendation output', () => {
  it('accepts bounded advice without an action', () => {
    expect(
      parseCopyrightAppealRecommendationOutput(
        JSON.stringify({ recommendation: 'uncertain', rationale: 'A moderator should review.' }),
      ),
    ).toEqual({ recommendation: 'uncertain', rationale: 'A moderator should review.' })
  })

  it('rejects unsupported or unbounded model output', () => {
    expect(() => parseCopyrightAppealRecommendationOutput('{')).toThrow(
      'Invalid copyright appeal recommendation JSON',
    )
    expect(() =>
      parseCopyrightAppealRecommendationOutput(
        JSON.stringify({ recommendation: 'takedown', rationale: 'Take action.' }),
      ),
    ).toThrow('Invalid copyright appeal recommendation output')
    expect(() =>
      parseCopyrightAppealRecommendationOutput(
        JSON.stringify({ recommendation: 'uncertain', rationale: 'x'.repeat(10_001) }),
      ),
    ).toThrow('Invalid copyright appeal recommendation output')
  })

  it('records a model recommendation against a persisted appeal', async () => {
    const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await insertTestPost({
      title: `appeal agent ${crypto.randomUUID()}`,
      slug: `appeal-agent-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const intake = await createCopyrightFormIntake({
      requesterUserId: claimant.id,
      requesterIdentity: `user:${claimant.id}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'A photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    })
    const targetId = (await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id))
      ?.targets[0]?.id
    if (!targetId) throw new Error('copyright target missing')
    const appeal = await createCopyrightAppeal(
      poster,
      intake.intake.copyright_notice_id,
      crypto.randomUUID(),
      { reason: 'I created this image.', targetIds: [targetId] },
    )
    const callModel = vi.fn<(input: string, safetyId: string) => Promise<unknown>>(() =>
      Promise.resolve({
        id: `resp-${crypto.randomUUID()}`,
        output: [
          {
            type: 'message',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  recommendation: 'reverse',
                  rationale: 'Moderator review is required.',
                }),
              },
            ],
          },
        ],
      }),
    )

    await expect(
      runCopyrightAppealRecommendationAgent(appeal.submission.id, callModel),
    ).resolves.toBe('reverse')
    expect(callModel).toHaveBeenCalledOnce()
    await expect(
      getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id),
    ).resolves.toMatchObject({
      appealRecommendations: [expect.objectContaining({ recommendation: 'reverse' })],
    })
  })
})
