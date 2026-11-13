import { createTestUser } from '../../index.mts'
import { createCopyrightFormIntake } from '../../../services/copyright-notices/form-intakes.mts'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../../../services/copyright-notices/compliance.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'
import { seedCopyrightStatementRestriction } from '../../copyright-statement-restriction-fixture.mts'
import type { createCopyrightFormFixture } from '../../copyright-route-fixtures.mts'

/**
 * Files the fixture's structured form and commits the complete human acceptance prerequisite. The notice
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
      goodFaithBelief: fixture.form.has_good_faith_belief,
      accuracyAuthorityUnderPenaltyOfPerjury:
        fixture.form.has_accuracy_authority_under_penalty_of_perjury,
      electronicSignature: fixture.form.electronic_signature,
      claimantTargets: fixture.form.targets.map(target => ({
        surfaceKind: 'post-image' as const,
        postId: target.post_id,
        imageId: target.image_id,
        hostedUseUrl: target.target_url,
      })),
    },
  })
  return acceptCopyrightFormIntakeFixture(intake, 'The notice is complete.')
}

/** Commits the complete accepted-intake prerequisite for read and privacy subjects. */
export async function acceptCopyrightFormIntakeFixture(
  intake: Awaited<ReturnType<typeof createCopyrightFormIntake>>,
  rationale: string,
): Promise<string> {
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const noticeId = intake.intake.copyright_notice_id
  await using transaction = await beginTransaction()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    {
      submissionId: intake.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    },
    transaction,
  )
  await transaction(sql`/* createAcceptedCopyrightNotice:review */
    INSERT INTO copyright_notice_form_intake_reviews
      (copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
    VALUES (${intake.intake.id}, ${new Date()}, ${moderator.id}, true,
      ${encryptSecret(rationale, `copyright-form-review:${intake.intake.id}`)})`)
  await transaction.commit()
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate || aggregate.targets.length === 0)
    throw new Error('Owned accepted notice lost its targets')
  for (const target of aggregate.targets) {
    await seedCopyrightStatementRestriction({
      noticeId,
      targetId: target.id,
      assessmentId: assessment.id,
      revision: target.placement_revision,
      moderatorId: moderator.id,
    })
  }
  return intake.intake.copyright_notice_id
}
