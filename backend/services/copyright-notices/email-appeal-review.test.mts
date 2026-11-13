import { describe, expect, it } from 'vitest'
import {
  createOwnedCopyrightEmailAppealScene,
  readOwnedEmailAppealAuthority,
} from '@voucha/test-helpers/copyright-email-appeal-scene'
import {
  assertOwnedEmailAppealReview,
  ownedEmailAppealText,
} from '@voucha/test-helpers/copyright-email-appeal-outcomes'
import { assertOwnedCopyrightMailPreparation } from '@voucha/test-helpers/copyright-email-work-outcomes'
import { seedEffectiveAppealDecision } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('email appeal review', () => {
  it('atomically records the unmatched submitter outcome with the actual appeal review', async () => {
    expect.hasAssertions()
    await assertOwnedEmailAppealReview(await createOwnedCopyrightEmailAppealScene())
  })

  it('emails the unmatched submitter from an independently committed appeal outcome', async () => {
    const scene = await createOwnedCopyrightEmailAppealScene()
    expect(await readOwnedEmailAppealAuthority(scene)).toEqual({
      automated: true,
      screening: scene.screeningId,
      assessor: null,
      imposed: null,
      current: true,
    })
    await seedEffectiveAppealDecision(scene.input, scene.noticeId)
    const reviewed = await getCopyrightNoticePrivateAggregate(scene.noticeId)
    const intent = reviewed?.deliveryIntents.find(
      row =>
        row.copyright_notice_submission_id === scene.input.submissionId &&
        row.delivery_kind === 'status_update' &&
        row.channel === 'email',
    )
    if (!intent) throw new Error('Committed email appeal outcome was not queued')
    expect(intent.recipient_user_id).toBeNull()
    expect(intent.recipient_role).toBe('correspondent')
    await assertOwnedCopyrightMailPreparation(
      intent.id,
      'poster@example.test',
      ownedEmailAppealText,
    )
  })
})
