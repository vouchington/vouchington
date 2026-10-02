import {
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
} from '../../../services/copyright-notices/repeat-infringer-incidents.mts'
import {
  createTestCopyrightFormIntakeReview,
  liftTestCopyrightRestriction,
} from '../../data-stores/psql/copyright-form-reviews.mts'
import { createTestUserDirect } from '../../entities/index.mts'
import { createTestCopyrightStaff } from './guest-capability.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'
import {
  createLiveGuestCapabilityCase,
  createOpenDeadlineCase,
  createOpenLegalHoldCase,
  createUnsentDeliveryCase,
  type RetentionBlockedCase,
} from './retention-blockers.mts'
import { sendAllCopyrightDeliveries } from './retention-deliveries.mts'
import { addRetentionArtifact } from './retention-minimal-case.mts'
import {
  createPreservedClaimantCase,
  createPreservedPosterCase,
} from './retention-preservation-holds.mts'
import { confirmTestRepeatInfringerNotice } from './repeat-infringer.mts'
import { createSignedInCopyrightForm } from './screened-form.mts'

/** A signed-in form no moderator has reviewed: the case is still undecided. */
async function createUnreviewedFormCase(): Promise<RetentionBlockedCase> {
  const [{ intake }, moderator] = await Promise.all([
    createSignedInCopyrightForm(),
    createTestUserDirect(),
  ])
  return {
    noticeId: intake.copyright_notice_id,
    evidenceKey: await addRetentionArtifact(intake.copyright_notice_submission_id),
    release: async () => {
      await createTestCopyrightFormIntakeReview({
        intakeId: intake.id,
        moderatorId: moderator.id,
        accepted: false,
      })
      await sendAllCopyrightDeliveries(intake.copyright_notice_id)
    },
  }
}

/**
 * A moderator-confirmed restriction on a poster's work. With `'lifted'` the restriction is lifted
 * but the repeat-infringer incident it raised is still operative; with `'active'` the incident
 * has its disposition but the restriction is still in force.
 */
async function createConfirmedRestrictionCase(
  restriction: 'lifted' | 'active',
): Promise<RetentionBlockedCase> {
  const [poster, moderator] = await Promise.all([
    createTestUserDirect(),
    createTestCopyrightStaff(),
  ])
  const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const restrictionId = aggregate?.restrictions[0]?.id
  const submissionId = aggregate?.submissions[0]?.id
  if (!restrictionId || !submissionId) {
    throw new Error('fixture restriction disappeared')
  }
  // Imposing it also queued the poster's notice; an unsent delivery is a blocker of its own.
  await sendAllCopyrightDeliveries(noticeId)
  const readIncident = async () =>
    (await getCopyrightRepeatInfringerAccount(poster.id)).incidents.find(
      entry => entry.copyright_notice_id === noticeId,
    )
  const incident = await readIncident()
  if (!incident?.operative) throw new Error('fixture incident is not operative')
  const recordDisposition = () =>
    recordCopyrightRepeatInfringerDisposition({
      currentUser: moderator,
      incidentId: incident.id,
      disposition: 'duplicate',
      rationale: `The notice duplicates an earlier case ${crypto.randomUUID()}.`,
      recordedAt: new Date(),
    })
  const evidenceKey = await addRetentionArtifact(submissionId)
  if (restriction === 'active') {
    await recordDisposition()
    return { noticeId, evidenceKey, release: () => liftTestCopyrightRestriction(restrictionId) }
  }
  await liftTestCopyrightRestriction(restrictionId)
  if (!(await readIncident())?.operative) throw new Error('lifting ended the incident')
  return { noticeId, evidenceKey, release: recordDisposition }
}

/** Every reason the sweep must keep a case, each as a fixture that can later be released. */
export const RETENTION_BLOCKERS: ReadonlyArray<[string, () => Promise<RetentionBlockedCase>]> = [
  ['an open legal hold', createOpenLegalHoldCase],
  ['an open restoration deadline', createOpenDeadlineCase],
  ['an unsent delivery', createUnsentDeliveryCase],
  ['a live guest capability', createLiveGuestCapabilityCase],
  ['an undecided form intake', createUnreviewedFormCase],
  ['an operative repeat-infringer incident', () => createConfirmedRestrictionCase('lifted')],
  ['a restriction still in force', () => createConfirmedRestrictionCase('active')],
  ['a preservation hold on the poster', createPreservedPosterCase],
  ['a preservation hold on the claimant', createPreservedClaimantCase],
]
