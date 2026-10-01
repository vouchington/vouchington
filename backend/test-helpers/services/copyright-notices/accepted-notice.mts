import { createTestUser } from '../../index.mts'
import { createCopyrightFormIntake } from '../../../services/copyright-notices/form-intakes.mts'
import { reviewCopyrightFormIntake } from '../../../services/copyright-notices/form-reviews.mts'
import type { createCopyrightFormFixture } from '../../../services/copyright-notices/route-test-fixtures.mts'

/**
 * Files the fixture's structured form as its claimant and has a moderator accept it. The notice
 * then appears on the accepted-notice list, which the plain `POST /api/v1/copyright-notices` route
 * does not do on its own. Accepted notices list newest first by acceptance time, so a test that
 * needs a stable list position accepts its notices one after another.
 */
export async function createAcceptedCopyrightNotice(
  fixture: Awaited<ReturnType<typeof createCopyrightFormFixture>>,
): Promise<string> {
  const intake = await createCopyrightFormIntake({
    currentUser: fixture.claimant,
    requesterIdentity: `user:${fixture.claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: fixture.form.claimant_display_name,
      claimantContact: fixture.form.claimant_contact,
      claimantEmail: fixture.form.claimant_email,
      workDescription: fixture.form.work_description,
      goodFaithBelief: fixture.form.good_faith_belief,
      accuracyAuthorityUnderPenaltyOfPerjury:
        fixture.form.accuracy_authority_under_penalty_of_perjury,
      electronicSignature: fixture.form.electronic_signature,
      claimantTargets: fixture.form.targets.map(target => ({
        postId: target.post_id,
        imageId: target.image_id,
        hostedUseUrl: target.target_url,
      })),
    },
  })
  await reviewCopyrightFormIntake({
    intakeId: intake.intake.id,
    currentUser: await createTestUser({ extraRoles: ['moderator'] }),
    accepted: true,
    rationale: 'The notice is complete.',
  })
  return intake.intake.copyright_notice_id
}
