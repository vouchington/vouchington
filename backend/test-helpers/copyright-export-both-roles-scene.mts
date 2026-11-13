import { createCopyrightFormIntake } from '../services/copyright-notices/form-intakes.mts'
import { createCopyrightFormFixture } from './copyright-route-fixtures.mts'
import { createTestUser } from './index.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  seedExportFormAcceptance,
  seedExportPosterFiling,
} from './copyright-export-canonical-writes.mts'

/** Identical private claimant/poster inputs, with complete committed facts before export/privacy reads. */
export async function createExportBothRolesScene() {
  const fixture = await createCopyrightFormFixture()
  const tag = crypto.randomUUID()
  const claimantPii = {
    legalName: `Claimant Legal Name ${tag}`,
    address: `${tag} Claimant Boulevard, Claimant City`,
    email: `claimant-${tag}@legal.example.test`,
    signature: `/s/ Claimant Signature ${tag}`,
    work: `Claimant work description ${tag}`,
  }
  const posterPii = {
    legalName: `Poster Legal Name ${tag}`,
    address: `${tag} Poster Avenue, Poster Town`,
    telephone: `+1-555-${tag.slice(0, 8)}`,
    signature: `/s/ Poster Signature ${tag}`,
    appealReason: `Poster appeal reason ${tag}`,
  }
  const hostedUseUrl = fixture.form.targets[0]!.target_url
  const intake = await createCopyrightFormIntake({
    currentUser: fixture.claimant,
    requesterIdentity: `user:${fixture.claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: claimantPii.legalName,
      claimantContact: claimantPii.address,
      claimantEmail: claimantPii.email,
      workDescription: claimantPii.work,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: claimantPii.signature,
      claimantTargets: fixture.form.targets.map(target => ({
        surfaceKind: 'post-image' as const,
        postId: target.post_id,
        imageId: target.image_id,
        hostedUseUrl: target.target_url,
      })),
    },
  })
  const noticeId = intake.intake.copyright_notice_id
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  await seedExportFormAcceptance(
    intake,
    moderator,
    'Internal moderator rationale that no participant may read.',
  )
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const targetId = aggregate!.targets[0]!.id
  const counterNotice = await seedExportPosterFiling(fixture.poster, noticeId, 'counter_notice', {
    name: posterPii.legalName,
    address: posterPii.address,
    telephone: posterPii.telephone,
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature: posterPii.signature,
    targetIds: [targetId],
  })
  await seedExportPosterFiling(fixture.poster, noticeId, 'appeal', {
    reason: posterPii.appealReason,
    targetIds: [targetId],
  })
  return {
    claimant: fixture.claimant,
    poster: fixture.poster,
    noticeId,
    targetId,
    hostedUseUrl,
    counterNoticeId: counterNotice.submission.id,
    claimantPii,
    posterPii,
    claimantSecrets: Object.values(claimantPii),
    posterSecrets: Object.values(posterPii),
  }
}
