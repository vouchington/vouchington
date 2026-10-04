import { randomBytes, randomUUID } from 'node:crypto'
import { promoteCopyrightEmailIntake } from '../../../services/copyright-notices/index.mts'
import {
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
} from '../../../services/copyright-notices/repeat-infringer-incidents.mts'
import { appendCopyrightEmailIntakeRecommendation } from '../../../services/copyright-notices/email-recommendations.mts'
import { liftTestCopyrightRestriction } from '../../data-stores/psql/copyright-form-reviews.mts'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../entities/index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'
import { sendAllCopyrightDeliveries } from './retention-deliveries.mts'
import { createRetentionParsedEmail, type RetentionCase } from './retention-parsed-email.mts'

/**
 * An email-sourced case a moderator promoted with an agent recommendation on file. Promotion
 * restricted the target and confirmed the restriction, which raised a repeat-infringer incident.
 * The incident was then dispositioned and the restriction lifted, so only the retention clock
 * keeps the case from the sweep.
 */
export async function createRetentionEmailCase(): Promise<RetentionCase & { intakeId: string }> {
  const [poster, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as PrivateUser
  const imageId = await insertTestImage(poster.id)
  const postId = await insertTestPost({
    title: `retention email ${randomUUID()}`,
    slug: `retention-email-${randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const intake = await createRetentionParsedEmail('promoted')
  await appendCopyrightEmailIntakeRecommendation({
    intakeId: intake.id,
    inputSha256: randomBytes(32),
    promptVersion: 'test-v1',
    model: 'test-model',
    structuredOutput: { claimant: 'Claimant Name', summary: `summary-${randomUUID()}` },
  })
  const promoted = await promoteCopyrightEmailIntake({
    currentUser: moderator,
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    jurisdiction: 'us_dmca',
    claimantDisplayName: 'Claimant Name',
    claimantContact: `claimant-${randomUUID()}@example.test`,
    claimantEmail: `claimant-${randomUUID()}@example.test`,
    workDescription: `Original photograph ${randomUUID()}`,
    goodFaithBelief: true,
    accuracyAuthorityUnderPenaltyOfPerjury: true,
    electronicSignature: 'Claimant Name',
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      },
    ],
    rationale: `The email carries the statutory statements ${randomUUID()}.`,
  })
  const noticeId = promoted.noticeId
  const restriction = (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]
  if (!restriction) throw new Error('fixture restriction missing')
  const incident = (await getCopyrightRepeatInfringerAccount(poster.id)).incidents.find(
    entry => entry.copyright_notice_id === noticeId,
  )
  if (!incident) throw new Error('fixture repeat-infringer incident missing')
  await recordCopyrightRepeatInfringerDisposition({
    currentUser: moderator,
    incidentId: incident.id,
    disposition: 'duplicate',
    rationale: `The notice duplicates an earlier case ${randomUUID()}.`,
    recordedAt: new Date(),
  })
  await liftTestCopyrightRestriction(restriction.id)
  await sendAllCopyrightDeliveries(noticeId)
  return {
    noticeId,
    moderator,
    posterId: poster.id,
    evidenceKeys: [intake.raw_storage_key],
    intakeId: intake.id,
  }
}
