import { describe, expect, it } from 'vitest'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import { readTestAutomaticWithholdingOutcome } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import { useAutomaticWithholdingSwitch } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { isTestCopyrightStaffCaseQueued } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/services/copyright-notices/surface-target-fixtures'
import { createCopyrightFormIntake } from './form-intakes.mts'
import {
  applyNonSpamSignedInCopyrightFormScreening,
  appendCopyrightFormScreening,
} from './form-screenings.mts'

async function createScreenedFormWithTargets(
  claimantTargets: Awaited<ReturnType<typeof createTestCopyrightImageFixture>>['selector'][],
) {
  const claimant = await createTestUser()
  const intake = await createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Test claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: `Test work ${crypto.randomUUID()}`,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Test claimant',
      claimantTargets,
    },
  })
  await appendCopyrightFormScreening({
    intakeId: intake.intake.id,
    inputSha256: Buffer.alloc(32, 24),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam markers.',
    guidance: testCopyrightFormGuidance,
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  return { intake, claimant }
}

describe('automatic withholding on surface targets', () => {
  const switchOn = useAutomaticWithholdingSwitch()

  it.each(['community-banner-image'] as const)(
    'refuses automatic withholding for a %s and keeps it in the staff queue',
    async kind => {
      await switchOn({ automaticWithholdingClaimantDailyCap: 0 })
      const surface = await createTestCopyrightImageFixture(kind)
      const form = await createScreenedFormWithTargets([surface.selector])
      const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })

      await applyNonSpamSignedInCopyrightFormScreening(
        form.intake.intake.copyright_notice_submission_id,
      )

      await expect(readTestAutomaticWithholdingOutcome(form.intake)).resolves.toEqual({
        refusal: 'non_post_target',
        assessments: 0,
        restrictions: 0,
      })
      await expect(
        isTestCopyrightStaffCaseQueued(form.intake.intake.copyright_notice_id, moderator),
      ).resolves.toBe(true)
    },
  )

  it('refuses a mixed post and surface notice as a whole', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: 0 })
    const [post, surface] = await Promise.all([
      createTestCopyrightImageFixture('post-image'),
      createTestCopyrightImageFixture('community-profile-image'),
    ])
    const form = await createScreenedFormWithTargets([post.selector, surface.selector])
    const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })

    await applyNonSpamSignedInCopyrightFormScreening(
      form.intake.intake.copyright_notice_submission_id,
    )

    await expect(readTestAutomaticWithholdingOutcome(form.intake)).resolves.toEqual({
      refusal: 'non_post_target',
      assessments: 0,
      restrictions: 0,
    })
    await expect(
      isTestCopyrightStaffCaseQueued(form.intake.intake.copyright_notice_id, moderator),
    ).resolves.toBe(true)
  })
})
