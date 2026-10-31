import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/index'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import {
  attemptCopyrightReceiptReviewMutation,
  insertPendingCopyrightReceiptDelivery,
  readCopyrightReceiptReview,
  seedCopyrightReceiptReview,
} from '@voucha/test-helpers/copyright-receipt-review-retirement'
import {
  placeCopyrightEmailReceiptPreservationHold,
  releaseCopyrightEmailReceiptPreservationHold,
} from './retention-receipt-preservation.mts'
import { sweepCopyrightReceiptReviews } from './retention-receipt-reviews.mts'
import { createCopyrightEmailIntake, ErasedCopyrightEmailIntakeReplay } from './email-intakes.mts'

const oldReview = new Date('2001-01-01T00:00:00.000Z')

describe('standalone copyright receipt review expiry', () => {
  useCopyrightIntakeEnvironment()
  it('erases expired final facts while retaining exact SES replay identity', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    const result = await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1 })
    expect(result.retired).toBeGreaterThanOrEqual(1)
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      amazon_ses_message_id: receipt.sesMessageId,
      review_decision: null,
      reviewed_by_id: null,
      reviewed_at: null,
      review_rationale_ciphertext: null,
    })
    await expect(
      createCopyrightEmailIntake({
        sesMessageId: receipt.sesMessageId,
        receivedAt: oldReview,
        rawStorageKey: receipt.rawStorageKey,
        rawSha256: receipt.rawSha256,
        rawMimeType: 'message/rfc822',
        rawByteSize: 12,
        sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
      }),
    ).rejects.toBeInstanceOf(ErasedCopyrightEmailIntakeReplay)
  })

  it('keeps recent, unerased and pending-delivery reviews and rejects direct review clearing', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const recent = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: new Date(),
    })
    const unerased = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
      erased: false,
    })
    const pending = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    await insertPendingCopyrightReceiptDelivery(pending.id)
    await expect(attemptCopyrightReceiptReviewMutation(pending.id)).rejects.toThrow(
      'copyright email receipt identity and completed review are immutable',
    )
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1 })
    for (const receipt of [recent, unerased, pending]) {
      expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
        review_decision: 'rejected',
      })
    }
  })

  it('blocks an active preservation hold and restarts the clock on release', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    const hold = await placeCopyrightEmailReceiptPreservationHold(
      reviewer,
      receipt.id,
      'court_request',
    )
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1 })
    expect((await readCopyrightReceiptReview(receipt.id))?.review_decision).toBe('rejected')
    await releaseCopyrightEmailReceiptPreservationHold(reviewer, receipt.id, hold.token)
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1 })
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      review_decision: 'rejected',
      current_preservation_hold_token: null,
      last_preservation_hold_released_at: expect.any(Date),
    })
  })
})
