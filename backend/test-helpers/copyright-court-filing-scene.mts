import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'
import { completeCopyrightMandatoryHumanReview } from '../services/copyright-notices/human-review.mts'
import { updateProfileImageId } from '../services/my/identity.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { createTestCopyrightImageFixture } from './copyright-surface-target-fixtures.mts'
import { createTestUserDirect } from './entities/users.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { resolveCopyrightImagePlacement } from '../services/copyright-notices/placement-resolution.mts'
import { issueCopyrightGuestCapability } from '../services/copyright-notices/guest-capabilities.mts'
import { appendCopyrightGuestFiling } from '../services/copyright-notices/guest-filings.mts'
import { appendCopyrightLegalHoldAssessment } from '../services/copyright-notices/holds.mts'
import {
  stageImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord,
} from '../services/media-delivery-safety/index.mts'

/** Real live profile, unassessed US notice, and the existing court assessment commands. */
export async function createCopyrightCourtFilingScene(shared?: {
  surface: Awaited<ReturnType<typeof createTestCopyrightImageFixture>>
  additionalSurfaces?: Awaited<ReturnType<typeof createTestCopyrightImageFixture>>[]
}) {
  const surface = shared?.surface ?? (await createTestCopyrightImageFixture('user-profile-image'))
  const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
  const resolved = await Promise.all(
    [surface, ...(shared?.additionalSurfaces ?? [])].map(item =>
      resolveCopyrightImagePlacement(item.selector),
    ),
  )
  const now = new Date()
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: now,
    claimantUserId: null,
    claimantDisplayName: 'Claimant',
    claimantContactCiphertext: `contact-${crypto.randomUUID()}`,
    workDescription: 'A copyrighted profile image.',
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'email',
      bodyCiphertext: `body-${crypto.randomUUID()}`,
    },
    targets: resolved,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  const target = aggregate?.targets[0]
  if (!target) throw new Error('Court filing target was not created')
  const staged = await stageImagePlacementDeliveryRecord({
    placementId: surface.placementId,
    revision: surface.placementRevision,
    imageId: surface.imageId,
    state: 'allow',
  })
  await publishStagedMediaDeliveryRecord(staged.mediaDeliveryRegistryRecordId)
  async function prepareFiling() {
    const capability = await issueCopyrightGuestCapability({
      currentUser: moderator,
      noticeId: notice.id,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    })
    return () =>
      appendCopyrightGuestFiling({
        noticeId: notice.id,
        token: capability.token,
        now,
        kind: 'court_or_ccb_hold',
        statement: 'A federal court proceeding has commenced.',
      })
  }
  return {
    surface,
    moderator,
    notice,
    target,
    now,
    async file() {
      return (await prepareFiling())()
    },
    assess(submissionId: string, qualifies: boolean) {
      return appendCopyrightLegalHoldAssessment({
        currentUser: moderator,
        submissionId,
        assessedAt: now,
        fromOriginalClaimant: qualifies,
        proceedingKind: qualifies ? 'federal_court' : null,
        ccbClaimKind: null,
        commencedAt: qualifies ? new Date(now.getTime() - 60_000) : null,
        receivedByDesignatedAgentAt: qualifies ? now : null,
        sameMaterial: qualifies,
        targetIds: [target.id],
        rationale: qualifies
          ? 'A qualifying original claimant proceeding covers this material.'
          : 'The filing does not establish a qualifying hold.',
      })
    },
  }
}

/** An independently assessed/reversed notice sharing the filing's real profile placement. */
export async function createMixedUnavailableCopyrightScene() {
  const filing = await createCopyrightCourtFilingScene()
  const submission = await filing.file()
  const ordinary = await createCopyrightCourtFilingScene({ surface: filing.surface })
  const aggregate = await getCopyrightNoticePrivateAggregate(ordinary.notice.id)
  const original = aggregate?.submissions.find(row => row.kind === 'notice')
  if (!original) throw new Error('Ordinary notice submission disappeared')
  const assessment = await appendCopyrightSubmissionAssessment({
    currentUser: ordinary.moderator,
    submissionId: original.id,
    assessedAt: new Date(),
    substantiallyCompliant: true,
  })
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: ordinary.notice.id,
    targetId: ordinary.target.id,
    assessmentId: assessment.id,
    imposedAt: new Date(),
    imposedById: null,
  })
  await completeCopyrightMandatoryHumanReview({
    currentUser: ordinary.moderator,
    noticeId: ordinary.notice.id,
    restrictionId: restriction.id,
    action: 'reverse',
    rationale: 'The original notice does not support this restriction.',
    reviewedAt: new Date(),
  })
  await updateProfileImageId(filing.surface.actorUserId, null)
  const restored = await getCopyrightNoticePrivateAggregate(ordinary.notice.id)
  const intent = restored?.actionIntents.find(
    row => row.action === 'restore' && row.state === 'pending',
  )
  if (!intent) throw new Error('Notice reversal did not create restoration work')
  return { filing, submission, ordinary, intent }
}
