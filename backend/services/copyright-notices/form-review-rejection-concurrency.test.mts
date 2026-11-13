import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { overlapCopyrightWriters } from '@voucha/test-helpers/copyright-restriction-assessment-race'
import { commitCopyrightWritersInOrder } from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readTestCopyrightFormReviewActor } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createCopyrightFormIntake, reviewCopyrightFormIntake } from './index.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'

describe('copyright form rejection concurrency', () => {
  useAutomaticProvisionalWithholding()

  it('retains the exact moderator or screening authority after overlap', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { notice, screeningId } = await createClearScreenedForm()
    const [reviewed, screened] = await commitCopyrightWritersInOrder(
      () =>
        reviewCopyrightFormIntake({
          intakeId: notice.intake.id,
          currentUser: moderator,
          is_accepted: false,
          rationale: 'The claimant did not substantiate this complaint.',
        }),
      () =>
        applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id),
      'reviewCopyrightFormIntake:review',
      'applyNonSpamSignedInCopyrightFormScreening:lock',
      notice.intake.copyright_notice_submission_id,
      [
        notice.intake.id,
        notice.intake.copyright_notice_id,
        notice.intake.copyright_notice_submission_id,
      ],
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    const reviewSuccess = expect.objectContaining({
      status: 'fulfilled',
      value: expect.objectContaining({ is_accepted: false }),
    })
    const reviewAbort = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'CONFLICT',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const screenAbort = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({ code: '40001' }),
    })
    const screenSuccess = { status: 'fulfilled', value: undefined }
    const human = [{ compliant: false, actor: moderator.id, screening: null }]
    const automated = [{ compliant: true, actor: null, screening: screeningId }]
    const reviewActor = await readTestCopyrightFormReviewActor(notice.intake.id).catch(
      (err: unknown) => {
        if (err instanceof Error && err.message.startsWith('Copyright form review was not found:'))
          return null
        throw err
      },
    )
    const state = {
      reviewed,
      screened,
      reviewActor,
      assessments: aggregate?.assessments.map(row => ({
        compliant: row.is_substantially_compliant,
        actor: row.assessed_by_id,
        screening: row.copyright_notice_form_screening_id,
      })),
      restrictions: aggregate?.restrictions.length,
      actions: aggregate?.actionIntents.map(row => ({ action: row.action, state: row.state })),
      events: aggregate?.lifecycleEvents.filter(row => row.change_type === 'submission_assessed')
        .length,
    }
    expect([
      {
        reviewed: reviewSuccess,
        screened: screenAbort,
        reviewActor: moderator.id,
        assessments: human,
        restrictions: 0,
        actions: [],
        events: 1,
      },
      {
        reviewed: reviewSuccess,
        screened: screenSuccess,
        reviewActor: moderator.id,
        assessments: human,
        restrictions: 0,
        actions: [],
        events: 1,
      },
      {
        reviewed: reviewAbort,
        screened: screenAbort,
        reviewActor: moderator.id,
        assessments: human,
        restrictions: 0,
        actions: [],
        events: 1,
      },
      {
        reviewed: reviewAbort,
        screened: screenSuccess,
        reviewActor: moderator.id,
        assessments: human,
        restrictions: 0,
        actions: [],
        events: 1,
      },
      {
        reviewed: reviewAbort,
        screened: screenAbort,
        reviewActor: null,
        assessments: [],
        restrictions: 0,
        actions: [],
        events: 0,
      },
      {
        reviewed: reviewAbort,
        screened: screenAbort,
        reviewActor: null,
        assessments: automated,
        restrictions: 0,
        actions: [],
        events: 1,
      },
      {
        reviewed: reviewAbort,
        screened: screenSuccess,
        reviewActor: null,
        assessments: automated,
        restrictions: 1,
        actions: [{ action: 'withhold', state: 'pending' }],
        events: 1,
      },
    ]).toContainEqual(state)
  })

  it('preserves one guest rejection or complete rollback across overlapping requests', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `guest race ${crypto.randomUUID()}`,
      slug: `guest-race-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightFormIntake({
      currentUser: null,
      requesterIdentity: `guest:${crypto.randomUUID()}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Guest claimant',
        claimantContact: 'guest@example.test',
        claimantEmail: 'guest@example.test',
        workDescription: 'Guest-owned photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Guest claimant',
        claimantTargets: [
          {
            surfaceKind: 'post-image' as const,
            postId,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
      },
    })
    const reject = (rationale: string) =>
      reviewCopyrightFormIntake({
        intakeId: notice.intake.id,
        currentUser: moderator,
        is_accepted: false,
        rationale,
      })
        .then(value => ({ status: 'fulfilled' as const, value }))
        .catch((err: unknown) => ({ status: 'rejected' as const, reason: err }))
    const key = `copyright-form-review:${notice.intake.id}`
    const [first, second] = await overlapCopyrightWriters(
      'reviewCopyrightFormIntake:review',
      () => reject('The guest complaint was not substantiated.'),
      () => reject('The overlapping request must not duplicate the decision.'),
      [notice.intake.id, notice.intake.copyright_notice_id, key],
      key,
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    const success = expect.objectContaining({
      status: 'fulfilled',
      value: expect.objectContaining({ is_accepted: false }),
    })
    const conflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'CONFLICT',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const state = {
      first,
      second,
      assessments: aggregate?.assessments.length,
      events: aggregate?.lifecycleEvents.filter(row => row.change_type === 'submission_assessed')
        .length,
    }
    expect([
      { first: success, second: conflict, assessments: 1, events: 1 },
      { first: conflict, second: success, assessments: 1, events: 1 },
      { first: conflict, second: conflict, assessments: 0, events: 0 },
    ]).toContainEqual(state)
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
  })
})
