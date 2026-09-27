import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import * as openaiProvider from '@modules/openai-utils/create-response'
import * as promptSanitizer from '@jongleberry/vurst-prompt'
import { readTestCopyrightStaffScreening } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import { createCopyrightFormIntake } from '@services/copyright-notices'
import { parseCopyrightFormScreeningOutput, runCopyrightFormScreeningAgent } from './run.mts'

vi.mock(import('@modules/openai-utils/create-response'), async importOriginal => ({
  ...(await importOriginal()),
  createOpenAIResponse: vi.fn<typeof openaiProvider.createOpenAIResponse>(),
}))

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
    expect(() => parseCopyrightFormScreeningOutput('{')).toThrow(
      'Invalid copyright form screening JSON',
    )
    expect(() =>
      parseCopyrightFormScreeningOutput(
        JSON.stringify({ recommendation: 'takedown', rationale: 'Looks valid.' }),
      ),
    ).toThrow('Invalid copyright form screening output')
  })

  it('records a non-spam assessment for a persisted structured form', async () => {
    const intake = await createScreeningForm()
    const createResponse = vi.spyOn(openaiProvider, 'createOpenAIResponse').mockResolvedValue({
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
    await expect(
      runCopyrightFormScreeningAgent(intake.intake.copyright_notice_submission_id),
    ).resolves.toBeNull()
    expect(createResponse).toHaveBeenCalledOnce()
  })

  it.each(['provider', 'sanitizer', 'parse'] as const)(
    'persists guarded failure after %s rejection',
    async kind => {
      const intake = await createScreeningForm()
      const provider = vi.spyOn(openaiProvider, 'createOpenAIResponse')
      if (kind === 'provider') provider.mockRejectedValue(new Error('Private provider error'))
      if (kind === 'sanitizer')
        vi.spyOn(promptSanitizer, 'sanitizePromptInjection').mockRejectedValue(
          new Error('Private sanitizer error'),
        )
      if (kind === 'parse')
        provider.mockResolvedValue({
          id: `resp-${crypto.randomUUID()}`,
          output: [
            {
              type: 'message',
              status: 'completed',
              content: [{ type: 'output_text', text: '{' }],
            },
          ],
        } as never)
      await expect(
        runCopyrightFormScreeningAgent(intake.intake.copyright_notice_submission_id),
      ).rejects.toThrow(/Private|Invalid copyright form screening/)
      await expect(
        readTestCopyrightStaffScreening(intake.intake.copyright_notice_id),
      ).resolves.toEqual({
        state: 'failed',
        recommendation: null,
        rationale: null,
      })
    },
  )
})

async function createScreeningForm() {
  const user = await createTestUser()
  const postId = await insertTestPost({
    title: `form agent ${crypto.randomUUID()}`,
    slug: `form-agent-${crypto.randomUUID()}`,
    createdById: user.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(user.id)
  await insertTestPostImage({ postId, imageId })
  return createCopyrightFormIntake({
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
}
