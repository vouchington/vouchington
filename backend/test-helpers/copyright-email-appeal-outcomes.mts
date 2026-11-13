import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { reviewCopyrightAppeal } from '../services/copyright-notices/submission-reviews.mts'
import { copyrightCorrespondencePurpose } from '../services/copyright-notices/correspondence.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  expectedEffectiveReview,
  effectiveReviewConflict,
} from './copyright-effective-review-outcomes.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightCaseLifecycleClock } from './copyright-lifecycle-clock.mts'
import {
  readOwnedEmailAppealAuthority,
  type createOwnedCopyrightEmailAppealScene,
} from './copyright-email-appeal-scene.mts'

type Scene = Awaited<ReturnType<typeof createOwnedCopyrightEmailAppealScene>>
export const ownedEmailAppealText =
  'Your appeal has been reviewed. See the copyright case for the recorded outcome.'
async function emailAppealState(scene: Scene) {
  const [effective, aggregate, authority, clock, { rows: mails }] = await Promise.all([
    readEffectiveReviewState(scene.noticeId, [scene.poster.id, scene.claimant.id]),
    getCopyrightNoticePrivateAggregate(scene.noticeId),
    readOwnedEmailAppealAuthority(scene),
    readCopyrightCaseLifecycleClock(scene.noticeId),
    write<{
      id: string
      correspondence: string
      body: string
      email: string
      recipient_user_id: string | null
      role: string
      channel: string
      state: string
      attempt_count: number
      key: string
    }>(sql`
      /* emailAppealState:mail */ SELECT work.id, message.id AS correspondence, message.body_ciphertext AS body,
        recipient.email_ciphertext AS email, work.recipient_user_id, work.recipient_role AS role,
        work.channel, work.state, work.attempt_count, work.idempotency_key AS key
      FROM copyright_notice_delivery_work_items work
      JOIN copyright_notice_correspondence_messages message ON message.id = work.copyright_notice_correspondence_message_id
      JOIN copyright_notice_delivery_recipients recipient ON recipient.copyright_notice_delivery_work_item_id = work.id
      WHERE work.copyright_notice_submission_id = ${scene.input.submissionId} AND work.delivery_kind = 'status_update' AND work.channel = 'email'`),
  ])
  if (!aggregate) throw new Error('Owned email appeal case is missing')
  return {
    effective,
    authority,
    clock,
    sources: {
      submissions: aggregate.submissions,
      evidence: aggregate.evidenceArtifacts,
      reviews: aggregate.emailCorrespondenceReviews,
      inbound: aggregate.correspondence.filter(row => row.direction === 'inbound'),
    },
    mails: mails.map(row => ({
      ...row,
      body: decryptSecret(row.body, copyrightCorrespondencePurpose(row.correspondence)),
      email: decryptSecret(row.email, `copyright-delivery-recipient:${row.id}`),
    })),
  }
}

/** Every review/account/notice/action and the unmatched-email outcome commit together or all roll back. */
export async function assertOwnedEmailAppealReview(scene: Scene) {
  const before = await emailAppealState(scene)
  expect(before.authority).toEqual({
    automated: true,
    screening: scene.screeningId,
    assessor: null,
    imposed: null,
    current: true,
  })
  expect(
    before.effective.state.restrictions.find(row => row.id === scene.restrictionId)?.review,
  ).toBeNull()
  const [outcome] = await Promise.allSettled([reviewCopyrightAppeal(scene.input)])
  const after = await emailAppealState(scene)
  const reviewId = after.effective.appeals.find(
    row => row.submission === scene.input.submissionId,
  )?.id
  const reviewed = expectedEffectiveReview(before.effective, {
    noticeId: scene.noticeId,
    restrictionId: scene.restrictionId,
    targetId: scene.targetId,
    revision: scene.revision,
    action: 'reverse',
    moderatorId: scene.moderator.id,
    posterId: scene.poster.id,
    kind: 'appeal',
    submissionId: scene.input.submissionId,
    reviewId,
    incidentUpdates: { [scene.poster.id]: null },
    ownerTargets: { [scene.poster.id]: [scene.targetId] },
    staydown: false,
  })
  const unwanted = `status_update:in_app:${scene.poster.id}`
  const email = {
    ...reviewed,
    state: {
      ...reviewed.state,
      deliveries: [
        ...reviewed.state.deliveries.filter(
          (_, index) => index !== reviewed.state.deliveries.lastIndexOf(unwanted),
        ),
        'status_update:email:null',
        `claimant_decision_notice:email:${scene.claimant.id}`,
        `claimant_decision_notice:in_app:${scene.claimant.id}`,
      ].toSorted(),
      correspondence: [...reviewed.state.correspondence, 'status_update'].toSorted(),
    },
  }
  expect([
    { outcome: effectiveReviewConflict, state: before },
    {
      outcome: { status: 'fulfilled', value: { noticeId: scene.noticeId, reviewIds: [reviewId] } },
      state: {
        ...before,
        effective: email,
        clock: expect.any(Date),
        mails: [
          {
            id: expect.any(String),
            correspondence: expect.any(String),
            body: ownedEmailAppealText,
            email: 'poster@example.test',
            recipient_user_id: null,
            role: 'correspondent',
            channel: 'email',
            state: 'pending',
            attempt_count: 0,
            key: `copyright-appeal-review:${scene.input.submissionId}:email-outcome`,
          },
        ],
      },
    },
  ]).toContainEqual({
    outcome: outcome!.status === 'fulfilled' ? outcome : copyrightRaceResult(outcome!),
    state: after,
  })
}
