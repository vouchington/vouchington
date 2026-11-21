import { describe, expect, it, onTestFinished } from 'vitest'
import { COPYRIGHT_TARGET_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { copyrightConfig } from './config.mts'
import { getCopyrightFormIntakeForScreening } from './form-screening-intake.mts'
import { parseCopyrightNoticeForm } from './http-input.mts'
import { parseTerritorialDecisionBody } from './territorial-http-input.mts'

function httpForm(targetCount: number): Record<string, unknown> {
  return {
    jurisdiction: 'us_dmca',
    claimant_display_name: 'Claimant',
    claimant_contact: 'claimant@example.test',
    claimant_email: 'claimant@example.test',
    work_description: 'Original photograph',
    has_good_faith_belief: true,
    has_accuracy_authority_under_penalty_of_perjury: true,
    electronic_signature: 'Claimant',
    targets: Array.from({ length: targetCount }, () => ({
      surface: 'post-image',
      post_id: crypto.randomUUID(),
      image_id: crypto.randomUUID(),
      target_url: 'https://voucha.ai/posts/example',
    })),
  }
}

describe('configured copyright claimant targets cap', () => {
  it('rejects a form above a lowered cap and accepts exactly the cap', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(copyrightConfig, { claimantTargetsMax: 2 }))
    await expect(createSignedInCopyrightForm(3)).rejects.toMatchObject({
      status: 422,
      code: COPYRIGHT_TARGET_LIMIT_REACHED,
    })
    await expect(createSignedInCopyrightForm(2)).resolves.toBeDefined()
    expect(() => parseCopyrightNoticeForm(httpForm(3))).toThrow(
      expect.objectContaining({ status: 422, code: COPYRIGHT_TARGET_LIMIT_REACHED }),
    )
  })

  it('keeps an empty target list a plain 422 without the limit code', () => {
    expect(() => parseCopyrightNoticeForm(httpForm(0))).toThrow(
      expect.objectContaining({ status: 422, code: undefined }),
    )
  })

  it('accepts more targets than the default once the cap is raised', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(copyrightConfig, { claimantTargetsMax: 25 }))
    const stored = await createSignedInCopyrightForm(21)
    expect(stored.intake.copyright_notice_submission_id).toBeDefined()
    expect(() => parseCopyrightNoticeForm(httpForm(21))).not.toThrow()
  })

  it('reads every stored target after the cap is lowered', async () => {
    const restoreRaised = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      claimantTargetsMax: 25,
    })
    onTestFinished(restoreRaised)
    const stored = await createSignedInCopyrightForm(21)
    restoreRaised()
    onTestFinished(overrideDynamicConfigFieldsForTest(copyrightConfig, { claimantTargetsMax: 2 }))
    const intake = await getCopyrightFormIntakeForScreening(
      stored.intake.copyright_notice_submission_id,
    )
    expect(intake?.hostedUseUrls).toHaveLength(21)
  })

  it('parses a territorial restrict decision naming more targets than the configured cap', () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(copyrightConfig, { claimantTargetsMax: 2 }))
    const body = {
      statement: 'Statement',
      public_explanation: 'Explanation',
      outcome: 'restrict',
      targets: httpForm(21).targets,
    }
    expect(parseTerritorialDecisionBody(body, 'statement').targets).toHaveLength(21)
  })
})
