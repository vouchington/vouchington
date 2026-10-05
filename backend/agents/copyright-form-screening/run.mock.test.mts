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
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { createCopyrightFormIntake } from '@services/copyright-notices'
import { runCopyrightFormScreeningAgent } from './run.mts'

vi.mock(import('@modules/openai-utils/create-response'), async importOriginal => ({
  ...(await importOriginal()),
  createOpenAIResponse: vi.fn<typeof openaiProvider.createOpenAIResponse>(),
}))

vi.mock(import('@jongleberry/vurst-prompt'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    sanitizePromptInjection: vi.fn<typeof actual.sanitizePromptInjection>(
      actual.sanitizePromptInjection,
    ),
  }
})

const screeningOutput = {
  recommendation: 'not_obviously_invalid',
  rationale: 'No obvious spam markers.',
  guidance: testCopyrightFormGuidance,
}

function mockProviderText(text: string) {
  return vi.spyOn(openaiProvider, 'createOpenAIResponse').mockResolvedValue({
    id: `resp-${crypto.randomUUID()}`,
    output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text }] }],
  } as never)
}

describe('copyright form screening agent', () => {
  afterEach(() => vi.restoreAllMocks())

  it('persists the recommendation and staff-visible guidance once per structured form', async () => {
    const intake = await createScreeningForm()
    const createResponse = mockProviderText(JSON.stringify(screeningOutput))

    await expect(
      runCopyrightFormScreeningAgent(intake.intake.copyright_notice_submission_id),
    ).resolves.toBe('not_obviously_invalid')
    expect(createResponse).toHaveBeenCalledOnce()
    await expect(
      readTestCopyrightStaffScreening(intake.intake.copyright_notice_id),
    ).resolves.toEqual({ state: 'completed', ...screeningOutput })
    await expect(
      runCopyrightFormScreeningAgent(intake.intake.copyright_notice_submission_id),
    ).resolves.toBeNull()
    expect(createResponse).toHaveBeenCalledOnce()
  })

  it('sends structured form fields without claimant contact, email, or signature values', async () => {
    const intake = await createScreeningForm({
      claimantContact: '742 Sentinel Terrace, Springfield · +1 555 0142',
      claimantEmail: 'sentinel-claimant@example.test',
      electronicSignature: '/s/ Sentinel Signer',
    })
    mockProviderText(JSON.stringify(screeningOutput))
    const sanitize = vi.mocked(promptSanitizer.sanitizePromptInjection)
    sanitize.mockClear()

    await runCopyrightFormScreeningAgent(intake.intake.copyright_notice_submission_id)

    expect(sanitize).toHaveBeenCalledOnce()
    const serialized = sanitize.mock.calls[0]![0]
    expect(JSON.parse(serialized)).toEqual({
      source_kind: 'signed_in_form',
      jurisdiction: 'us_dmca',
      statutory_fields_complete: true,
      claimant_display_name: 'Claimant',
      work_description: 'A photograph',
      hosted_use_urls: [
        expect.stringMatching(/^https:\/\/voucha\.ai\/[a-z-]+\/form-agent-[0-9a-f-]+$/),
      ],
      has_claimant_contact: true,
      has_claimant_email: true,
      has_electronic_signature: true,
      has_good_faith_belief: true,
      has_accuracy_authority_under_penalty_of_perjury: true,
    })
    for (const secret of ['Sentinel Terrace', '555 0142', 'sentinel-claimant', 'Sentinel Signer'])
      expect(serialized).not.toContain(secret)
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
      if (kind === 'parse') mockProviderText('{')
      await expect(
        runCopyrightFormScreeningAgent(intake.intake.copyright_notice_submission_id),
      ).rejects.toThrow(/Private|Invalid copyright form screening/)
      await expect(
        readTestCopyrightStaffScreening(intake.intake.copyright_notice_id),
      ).resolves.toEqual({ state: 'failed', recommendation: null, rationale: null, guidance: null })
    },
  )
})

async function createScreeningForm(
  claimant: { claimantContact?: string; claimantEmail?: string; electronicSignature?: string } = {},
) {
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
    currentUser: user,
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
      ...claimant,
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
}
