import { describe, expect, it } from 'vitest'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { getCopyrightParticipantNoticeDetail } from './read-models.mts'
import { getImagePlacementDeliveryKey } from '@services/media-delivery-safety'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import {
  completeTestMediaDeliveryRecord,
  getTestMediaDeliveryRecord,
} from '@voucha/test-helpers/entities/image-surface-placements'
import { getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { createTestLiftClaimantReceipt } from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  createCopyrightCounterNotice,
  completeCopyrightMandatoryHumanReview,
  processCopyrightActionIntent,
  reviewCopyrightCounterNotice,
} from './index.mts'
import { calculateUsCounterNoticeRestorationWindow } from './deadlines.mts'
import {
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
} from './repeat-infringer-incidents.mts'
import { createDueStatutoryCopyrightRestoreIntentsForDeadline } from './statutory-restoration-schedule.mts'

describe('deleted community image setters and copyright response flows', () => {
  it('keeps a community restriction withheld when its setter is deleted without a counter-notice', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image')
    const restricted = await createTestCopyrightRestrictionForImage(fixture)
    const setter = await getTestPrivateUserById(fixture.actorUserId)
    if (!setter) throw new Error('Community setter fixture missing')

    await processCopyrightActionIntent(
      restricted.withholdIntentId,
      new Date(),
      createTestCopyrightDeliveryDependencies(async () => undefined),
    )
    const initialWithheld = await getImagePlacementForCopyright(fixture.placementId)
    await completeTestMediaDeliveryRecord(
      getImagePlacementDeliveryKey({
        placementId: fixture.placementId,
        revision: initialWithheld!.revision,
        imageId: fixture.imageId,
      }),
    )
    await deleteUserAndDrainForTest(setter, setter)

    const aggregate = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: restricted.restrictionId, lifted_at: null }),
      ]),
    )
    expect(aggregate?.actionIntents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          copyright_restriction_id: restricted.restrictionId,
          action: 'restore',
        }),
      ]),
    )
    const participant = await getCopyrightParticipantNoticeDetail(restricted.noticeId, setter)
    expect(participant).toBeNull()
    await expect(getCopyrightRepeatInfringerAccount(fixture.actorUserId)).resolves.toMatchObject({
      incidents: [],
    })
    const withheld = await getImagePlacementForCopyright(fixture.placementId)
    expect(withheld).toMatchObject({ withheld: true, imageId: fixture.imageId })
    await expect(
      getTestMediaDeliveryRecord(
        getImagePlacementDeliveryKey({
          placementId: fixture.placementId,
          revision: withheld!.revision,
          imageId: fixture.imageId,
        }),
      ),
    ).resolves.toMatchObject({ desired_state: 'withheld' })
  })

  it('keeps the restriction withheld when staff reject the setter’s counter-notice', async () => {
    const fixture = await createTestCopyrightImageFixture('community-profile-image')
    const restricted = await createTestCopyrightRestrictionForImage(fixture)
    const setter = await getTestPrivateUserById(fixture.actorUserId)
    if (!setter) throw new Error('Community setter fixture missing')
    await processCopyrightActionIntent(
      restricted.withholdIntentId,
      new Date(),
      createTestCopyrightDeliveryDependencies(async () => undefined),
    )
    const counterNotice = await createCopyrightCounterNotice(
      setter,
      restricted.noticeId,
      crypto.randomUUID(),
      {
        name: 'Community image setter',
        address: `${crypto.randomUUID()} Main Street`,
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Community image setter',
        targetIds: [restricted.targetId],
      },
    )
    const review = await reviewCopyrightCounterNotice({
      submissionId: counterNotice.submission.id,
      currentUser: restricted.moderator,
      is_accepted: false,
      rationale: 'The statutory counter-notice fields were incomplete.',
    })
    expect(review.deadlineId).toBeNull()
    const after = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    expect(
      after?.restrictions.find(row => row.id === restricted.restrictionId)?.lifted_at,
    ).toBeNull()
    expect(after?.actionIntents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          copyright_restriction_id: restricted.restrictionId,
          action: 'restore',
        }),
      ]),
    )
    await expect(getImagePlacementForCopyright(fixture.placementId)).resolves.toMatchObject({
      withheld: true,
    })
  })

  it.each([
    ['accepted before deletion', false],
    ['accepted after deletion', true],
  ] as const)(
    'restores a surface image by the counter-notice receipt window when accepted %s',
    async (_label, deleteBeforeAcceptance) => {
      const fixture = await createTestCopyrightImageFixture('community-profile-image')
      const restricted = await createTestCopyrightRestrictionForImage(fixture)
      await createTestLiftClaimantReceipt(
        restricted.noticeId,
        `counter-${crypto.randomUUID()}@example.test`,
      )
      const setter = await getTestPrivateUserById(fixture.actorUserId)
      if (!setter) throw new Error('Community setter fixture missing')
      await processCopyrightActionIntent(
        restricted.withholdIntentId,
        new Date(),
        createTestCopyrightDeliveryDependencies(async () => undefined),
      )
      await completeCopyrightMandatoryHumanReview({
        noticeId: restricted.noticeId,
        restrictionId: restricted.restrictionId,
        currentUser: restricted.moderator,
        action: 'confirm',
        rationale: 'The restriction was reviewed and confirmed.',
        reviewedAt: new Date(),
      })
      const incident = (
        await getCopyrightRepeatInfringerAccount(fixture.actorUserId)
      ).incidents.find(row => row.copyright_notice_id === restricted.noticeId)
      if (!incident?.is_operative) throw new Error('Confirmed setter incident missing')

      const counterNotice = await createCopyrightCounterNotice(
        setter,
        restricted.noticeId,
        crypto.randomUUID(),
        {
          name: 'Community image setter',
          address: `${crypto.randomUUID()} Main Street`,
          telephone: '555-0100',
          consentToFederalJurisdiction: true,
          consentToServiceOfProcess: true,
          goodFaithMisidentificationUnderPenaltyOfPerjury: true,
          electronicSignature: 'Community image setter',
          targetIds: [restricted.targetId],
        },
      )
      const receivedAt = counterNotice.submission.received_at
      await expect(deleteUserAndDrainForTest(setter, setter)).rejects.toMatchObject({ status: 409 })
      if (deleteBeforeAcceptance) {
        await recordCopyrightRepeatInfringerDisposition({
          currentUser: restricted.moderator,
          incidentId: incident.id,
          disposition: 'withdrawn',
          rationale: `The setter requested deletion ${crypto.randomUUID()}.`,
          recordedAt: new Date(),
        })
        await deleteUserAndDrainForTest(setter, setter)
      }
      const review = await reviewCopyrightCounterNotice({
        submissionId: counterNotice.submission.id,
        currentUser: restricted.moderator,
        is_accepted: true,
        rationale: 'The structured counter-notice is formally complete.',
      })
      if (!review.deadlineId) throw new Error('Counter-notice deadline missing')
      if (!deleteBeforeAcceptance) {
        await recordCopyrightRepeatInfringerDisposition({
          currentUser: restricted.moderator,
          incidentId: incident.id,
          disposition: 'withdrawn',
          rationale: `The setter requested deletion ${crypto.randomUUID()}.`,
          recordedAt: new Date(),
        })
        await deleteUserAndDrainForTest(setter, setter)
      }

      const window = calculateUsCounterNoticeRestorationWindow(receivedAt)
      const reviewed = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
      const deadline = reviewed?.deadlines.find(row => row.id === review.deadlineId)
      expect(deadline).toMatchObject(window)
      const dueAt = new Date(window.earliest_restoration_at.getTime() + 60_000)
      await expect(
        createDueStatutoryCopyrightRestoreIntentsForDeadline(review.deadlineId, dueAt),
      ).resolves.toBe(1)
      const due = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
      const restore = due?.actionIntents.find(
        row =>
          row.copyright_restriction_id === restricted.restrictionId && row.action === 'restore',
      )
      if (!restore) throw new Error('Statutory restore intent missing')
      await expect(
        processCopyrightActionIntent(
          restore.id,
          dueAt,
          createTestCopyrightDeliveryDependencies(async () => undefined),
        ),
      ).resolves.toBe('applied')
      const restored = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
      expect(restored?.deadlines.find(row => row.id === review.deadlineId)).toMatchObject({
        ...window,
        resolved_at: dueAt,
      })
      expect(
        restored?.restrictions.find(row => row.id === restricted.restrictionId)?.lifted_at,
      ).not.toBeNull()
      await expect(getImagePlacementForCopyright(fixture.placementId)).resolves.toMatchObject({
        withheld: false,
      })
    },
  )
})
