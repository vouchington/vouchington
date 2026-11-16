import { describe, expect, it } from 'vitest'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { createTestUserDirect } from '@voucha/test-helpers/entities/index'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import {
  attemptCopyrightReceiptReviewMutation,
  readCopyrightReceiptHolds,
  readCopyrightReceiptReview,
  retireOldCopyrightReceiptRationale,
  seedCopyrightReceiptReview,
  seedOldCopyrightReceiptRationale,
  seedReleasedCopyrightReceiptHold,
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
  useCopyrightEvidenceBucket()
  it('keeps the final explanation when hold admission wins the retirement lock', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    let skipped: Awaited<ReturnType<typeof sweepCopyrightReceiptReviews>> | undefined
    const restore = afterPostgresTransactionQueryForTest(
      '/* placeCopyrightEmailReceiptPreservationHold */',
      values => values.includes(receipt.id),
      async () => {
        skipped = await sweepCopyrightReceiptReviews({
          batchSize: 1,
          maxBatches: 1,
          receiptIds: [receipt.id],
        })
      },
    )
    let admitted: Awaited<ReturnType<typeof placeCopyrightEmailReceiptPreservationHold>>
    try {
      admitted = await placeCopyrightEmailReceiptPreservationHold(
        reviewer,
        receipt.id,
        'court_request',
      )
    } finally {
      restore()
    }
    expect(skipped).toEqual({ scanned: 0, retired: 0, hasMore: false })
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      review_decision: 'rejected',
      review_rationale_ciphertext: 'v1:test-rationale',
    })
    expect(await readCopyrightReceiptHolds(receipt.id)).toEqual([
      { id: admitted.id, released_at: null },
    ])
  })

  it('admits only one open preservation hold from competing standalone snapshots', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    let winningHoldId: string | undefined
    const restore = afterPostgresTransactionQueryForTest(
      '/* findOpenCopyrightEmailReceiptPreservationHold */',
      values => values.includes(receipt.id),
      async () => {
        winningHoldId = (
          await placeCopyrightEmailReceiptPreservationHold(
            reviewer,
            receipt.id,
            'regulator_request',
          )
        ).id
      },
    )
    try {
      await expect(
        placeCopyrightEmailReceiptPreservationHold(reviewer, receipt.id, 'court_request'),
      ).rejects.toMatchObject({ status: 409 })
    } finally {
      restore()
    }
    expect(winningHoldId).toEqual(expect.any(String))
    expect(await readCopyrightReceiptHolds(receipt.id)).toEqual([
      { id: winningHoldId, released_at: null },
    ])
  })

  it('rejects preservation admission after its final-review snapshot loses to owned retirement', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    const outside = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    let retired = 0
    const restore = afterPostgresTransactionQueryForTest(
      '/* requireStandaloneCopyrightReceiptPreservation */',
      values => values.includes(receipt.id),
      async () => {
        const result = await sweepCopyrightReceiptReviews({
          batchSize: 1,
          maxBatches: 1,
          receiptIds: [receipt.id],
        })
        retired = result.retired
      },
    )
    try {
      await expect(
        placeCopyrightEmailReceiptPreservationHold(reviewer, receipt.id, 'court_request'),
      ).rejects.toMatchObject({ status: 409 })
    } finally {
      restore()
    }
    expect(retired).toBe(1)
    expect((await readCopyrightReceiptReview(receipt.id))?.review_decision).toBeNull()
    expect(await readCopyrightReceiptHolds(receipt.id)).toEqual([])
    expect((await readCopyrightReceiptReview(outside.id))?.review_decision).toBe('rejected')
  })
  it('erases expired final facts while retaining exact SES replay identity', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    const result = await sweepCopyrightReceiptReviews({
      batchSize: 10,
      maxBatches: 1,
      receiptIds: [receipt.id],
    })
    expect(result.retired).toBe(1)
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

  it('keeps recent and unerased reviews and rejects direct review clearing', async () => {
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
    await expect(attemptCopyrightReceiptReviewMutation(unerased.id)).rejects.toThrow(
      'copyright email receipt identity and completed review are immutable',
    )
    await sweepCopyrightReceiptReviews({
      batchSize: 10,
      maxBatches: 1,
      receiptIds: [recent.id, unerased.id],
    })
    for (const receipt of [recent, unerased]) {
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
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1, receiptIds: [receipt.id] })
    expect((await readCopyrightReceiptReview(receipt.id))?.review_decision).toBe('rejected')
    await releaseCopyrightEmailReceiptPreservationHold(reviewer, receipt.id, hold.id)
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1, receiptIds: [receipt.id] })
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      review_decision: 'rejected',
    })
    expect(await readCopyrightReceiptHolds(receipt.id)).toEqual([
      expect.objectContaining({ id: hold.id, released_at: expect.any(Date) }),
    ])
  })

  it('deletes expired released holds with the final review facts', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    await seedReleasedCopyrightReceiptHold({
      receiptId: receipt.id,
      staffId: reviewer.id,
      releasedAt: new Date('2002-01-01T00:00:00.000Z'),
    })
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1, receiptIds: [receipt.id] })
    expect((await readCopyrightReceiptReview(receipt.id))?.review_decision).toBeNull()
    expect(await readCopyrightReceiptHolds(receipt.id)).toEqual([])
  })

  it('waits for a dependent attempted rationale to retire first', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
      erased: false,
    })
    const rationaleId = await seedOldCopyrightReceiptRationale(receipt, reviewer.id)
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1, receiptIds: [receipt.id] })
    expect((await readCopyrightReceiptReview(receipt.id))?.review_decision).toBe('rejected')
    expect(await retireOldCopyrightReceiptRationale(rationaleId)).toBe(1)
    await sweepCopyrightReceiptReviews({
      batchSize: 10,
      maxBatches: 1,
      now: new Date(Date.now() + 2 * 86_400_000),
      receiptIds: [receipt.id],
    })
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      review_decision: null,
      review_rationale_ciphertext: null,
    })
  })
})
