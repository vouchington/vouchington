import { describe, expect, it } from 'vitest'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { createTestUserDirect } from '@voucha/test-helpers'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  createCopyrightEmailIntake,
  processCopyrightActionIntent,
  recordCopyrightEmailParse,
  reviewCopyrightAppeal,
} from './index.mts'
import { admitCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

describe('email appeal restoration for a surface image', () => {
  it('restores a community image after staff admit and reverse an emailed appeal', async () => {
    const fixture = await createTestCopyrightImageFixture('community-profile-image')
    const restricted = await createTestCopyrightRestrictionForImage(fixture)
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const delivery = createTestCopyrightDeliveryDependencies(async () => undefined)
    await processCopyrightActionIntent(restricted.withholdIntentId, new Date(), delivery)

    const sesMessageId = `ses-surface-appeal-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 28),
      rawMimeType: 'message/rfc822',
      rawByteSize: 16,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: `setter-${crypto.randomUUID()}@example.test`,
      subject: 'Appeal of image restriction',
      bodyText: 'I set this community image and ask staff to reverse the restriction.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: intake.id,
      noticeId: restricted.noticeId,
      linkKind: 'thread',
    })
    const admitted = await admitCopyrightEmailCorrespondence({
      currentUser: reviewer,
      intakeId: intake.id,
      kind: 'appeal',
      targetIds: [restricted.targetId],
      structuredSubmission: {
        reason: 'I set and manage this community image.',
        targetIds: [restricted.targetId],
      },
      rationale: 'The sender identified the community image restriction being appealed.',
      recommendationId: null,
      manualFallbackReason: 'The review record is sufficient without an agent recommendation.',
    })
    await reviewCopyrightAppeal({
      submissionId: admitted.submissionId,
      currentUser: reviewer,
      recommendationId: null,
      manualFallbackReason: 'The record is sufficient without an agent recommendation.',
      rationale: 'The supplied record supports reversing the image restriction.',
      decisions: [{ restrictionId: restricted.restrictionId, action: 'reverse' }],
    })

    const reversed = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    const restore = reversed?.actionIntents.find(
      row => row.copyright_restriction_id === restricted.restrictionId && row.action === 'restore',
    )
    if (!restore) throw new Error('Surface appeal restore intent missing')
    await expect(processCopyrightActionIntent(restore.id, new Date(), delivery)).resolves.toBe(
      'applied',
    )
    expect(await getImagePlacementForCopyright(fixture.placementId)).toMatchObject({
      withheld: false,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(restricted.noticeId))?.restrictions.find(
        row => row.id === restricted.restrictionId,
      )?.lifted_at,
    ).not.toBeNull()
  })
})
