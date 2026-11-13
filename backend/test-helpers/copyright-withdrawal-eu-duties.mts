import { seedApiEuComplaint } from './copyright-api-eu-complaint-replay.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { expect } from 'vitest'
import type { PrivateUser } from '../services/users/types.mts'
import { receiveEuCopyrightNotice } from '../services/copyright-notices/eu-notice-receipt.mts'
import {
  assertWithdrawalWithhold,
  assertWithdrawalRestore,
  seedCompletedWithdrawalRestoration,
  assertCompletedWithdrawalRestoration,
} from './copyright-withdrawal-action-duties.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedCommittedTerritorialAcknowledgment } from './copyright-territorial-acknowledged-fixture.mts'
import { seedCommittedTerritorialDecision } from './copyright-territorial-committed-decision.mts'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from './copyright-territorial-committed-redress.mts'
import { assertTerritorialRequestOutcome } from './copyright-territorial-request-outcome.mts'
import { assertTerritorialReviewOutcome } from './copyright-territorial-review-outcome.mts'
import { readTestCopyrightStatementIntents } from './copyright-statement-notices.mts'
import { seedWithdrawalFailedAcknowledgment } from './copyright-withdrawal-ack-outcome.mts'
import { euNoticeRequest, target, actionIntent } from './copyright-withdrawal-owned-inputs.mts'

export async function prepareEuWithdrawalDuties(claimant: PrivateUser, staff: PrivateUser) {
  const pending = await receiveEuCopyrightNotice(
    { user: claimant, identity: `user:${claimant.id}` },
    crypto.randomUUID(),
    euNoticeRequest(),
  )
  const failed = await seedWithdrawalFailedAcknowledgment(pending.notice_id)
  expect(failed?.attempt_count).toBe(1)
  const restricted = async () => {
    const post = await createHostedImagePost('public')
    const notice = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
    const acknowledgment = await seedCommittedTerritorialAcknowledgment('eu_dsa', notice.notice_id)
    await seedCommittedTerritorialDecision('eu_dsa', staff, notice.notice_id, {
      text: 'The notice identifies the work and the infringing hosted image.',
      publicExplanation: 'This post image reproduces the claimant’s work.',
      outcome: 'restrict',
      targets: [target(post)],
    })
    return { noticeId: notice.notice_id, post, acknowledgment }
  }
  const notification = await restricted()
  const restoration = await restricted()
  const completed = await restricted()
  await seedCompletedWithdrawalRestoration('eu_dsa', completed.noticeId, claimant, staff)
  const review = await restricted()
  const reviewRequest = await seedCommittedTerritorialRedress(
    'eu_dsa',
    review.noticeId,
    claimant,
    'The first image should be restored.',
  )
  const supervised = await seedApiEuComplaint({
    noticeId: notification.noticeId,
    actorId: claimant.id,
    key: crypto.randomUUID(),
    authorityReference: `DSC-${crypto.randomUUID()}`,
    explanation: 'The notified decision merits supervisory review.',
  })
  return {
    failedNoticeId: pending.notice_id,
    notification,
    restoration,
    completed,
    review,
    reviewRequest,
    supervised,
    claimant,
    staff,
  }
}

type Duties = Awaited<ReturnType<typeof prepareEuWithdrawalDuties>>
/** Committed facts keep the original receipt, target, recipient and channel assertions unconditional. */
export async function assertEuWithdrawalNoticeDuties(scene: Duties) {
  const { noticeId, post } = scene.notification
  expect(scene.supervised).toEqual({ id: expect.any(String), escalation_id: expect.any(String) })
  const supervision = await readCopyrightApiTerritorialState(noticeId)
  expect(supervision.complaints).toEqual([
    expect.objectContaining({
      id: scene.supervised.id,
      copyright_notice_id: noticeId,
      recorded_by_id: scene.claimant.id,
    }),
  ])
  expect(supervision.escalations).toEqual([
    expect.objectContaining({
      id: scene.supervised.escalation_id,
      copyright_notice_id: noticeId,
      copyright_eu_supervised_complaint_id: scene.supervised.id,
    }),
  ])
  const state = await getCopyrightNoticePrivateAggregate(noticeId)
  expect(state?.restrictions).toHaveLength(1)
  expect(state?.actionIntents.some(row => row.action === 'withhold')).toBe(true)
  expect(await readTestCopyrightStatementIntents(noticeId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        delivery_kind: 'poster_restriction_notice',
        channel: 'in_app',
        recipient_user_id: post.poster.id,
      }),
      expect.objectContaining({
        delivery_kind: 'poster_restriction_notice',
        channel: 'email',
        recipient_user_id: post.poster.id,
      }),
      expect.objectContaining({
        delivery_kind: 'claimant_decision_notice',
        channel: 'in_app',
        recipient_user_id: scene.claimant.id,
      }),
    ]),
  )
}

/** Both original redress actors run once; the decision has its own committed request prerequisite. */
export async function assertEuWithdrawalRedressActors(scene: Duties, requestNoticeId: string) {
  await assertTerritorialRequestOutcome(
    'eu_dsa',
    requestNoticeId,
    scene.claimant,
    'The first image should be restored.',
    'notifier',
  )
  await assertTerritorialReviewOutcome({
    jurisdiction: 'eu_dsa',
    noticeId: scene.review.noticeId,
    redressId: scene.reviewRequest.id,
    staff: scene.staff,
    claimantId: scene.claimant.id,
    posterId: scene.review.post.poster.id,
    disposition: 'revoke',
    rationale: 'The restriction is reversed after complaint review.',
  })
}

/** A distinct committed reversal allows the real restore processor to run after any actor abort. */
export async function completeEuWithdrawalRestoration(scene: Duties) {
  const { noticeId } = scene.restoration
  await assertWithdrawalWithhold(scene.notification.noticeId, scene.notification.post.poster.id)
  await seedRestorationSceneWithhold((await actionIntent(noticeId, 'withhold')).id)
  const complaint = await seedCommittedTerritorialRedress(
    'eu_dsa',
    noticeId,
    scene.claimant,
    'The first image should be restored.',
  )
  await seedCommittedTerritorialRedressDecision('eu_dsa', noticeId, complaint.id, scene.staff, {
    disposition: 'revoke',
    rationale: 'The restriction is reversed after complaint review.',
  })
  await assertWithdrawalRestore(noticeId, scene.restoration.post.poster.id)
  await assertCompletedWithdrawalRestoration(
    scene.completed.noticeId,
    scene.completed.post.poster.id,
  )
}
