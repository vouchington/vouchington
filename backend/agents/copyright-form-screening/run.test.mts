import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import * as agentShared from '@agents/_shared'
import { createCopyrightFormIntake } from '@services/copyright-notices'
import { parseCopyrightFormScreeningOutput, runCopyrightFormScreeningAgent } from './run.mts'

describe('copyright form screening output', () => {
  afterEach(() => vi.restoreAllMocks())
  it('accepts the not-obviously-invalid anti-spam recommendation', () => {
    expect(
      parseCopyrightFormScreeningOutput(
        JSON.stringify({
          recommendation: 'not_obviously_invalid',
          rationale: 'No obvious spam markers.',
        }),
      ),
    ).toEqual({
      recommendation: 'not_obviously_invalid',
      rationale: 'No obvious spam markers.',
    })
  })

  it('rejects a recommendation outside the anti-spam vocabulary', () => {
    expect(() =>
      parseCopyrightFormScreeningOutput(
        JSON.stringify({ recommendation: 'takedown', rationale: 'Looks valid.' }),
      ),
    ).toThrow('Invalid copyright form screening output')
  })

  it('records a non-spam assessment for a persisted structured form', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `form agent ${crypto.randomUUID()}`,
      slug: `form-agent-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(user.id)
    await insertTestPostImage({ postId, imageId })
    const intake = await createCopyrightFormIntake({
      requesterUserId: user.id,
      requesterIdentity: `user:${user.id}`,
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
    const createResponse = vi.spyOn(agentShared, 'createOpenAIResponse').mockResolvedValue({
      id: `resp-${crypto.randomUUID()}`,
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                recommendation: 'not_obviously_invalid',
                rationale: 'No obvious spam markers.',
              }),
            },
          ],
        },
      ],
    } as never)

    await expect(
      runCopyrightFormScreeningAgent(intake.intake.copyright_notice_submission_id),
    ).resolves.toBe('not_obviously_invalid')
    expect(createResponse).toHaveBeenCalledOnce()
  })
})
