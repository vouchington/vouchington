import { beforeEach, describe, expect, it } from 'vitest'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { createTestUserDirect } from '@voucha/test-helpers/entities/index'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import {
  attemptCopyrightReceiptReviewMutation,
  copyrightReceiptReviewFixturePriority,
  peekCopyrightReceiptReviewRetirementCandidate,
  isCopyrightReceiptReviewRetirementEligible,
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

let oldReview: Date
const retirementCutoff = new Date('1900-01-01T00:00:00.000Z')

describe('standalone copyright receipt review expiry', () => {
  useCopyrightIntakeEnvironment()
  useCopyrightEvidenceBucket()
  beforeEach(async () => {
    oldReview = await copyrightReceiptReviewFixturePriority()
  })
  it('keeps the final explanation when hold admission wins the retirement lock', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: oldReview,
    })
    const sentinel = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: new Date(oldReview.getTime() + 86_400_000),
      erased: false,
    })
    expect(await peekCopyrightReceiptReviewRetirementCandidate(retirementCutoff)).toBe(receipt.id)
    let preservedDuringSweep: Awaited<ReturnType<typeof readCopyrightReceiptReview>> | undefined
    const restore = afterPostgresTransactionQueryForTest(
      '/* placeCopyrightEmailReceiptPreservationHold */',
      values => values.includes(receipt.id),
      async () => {
        await sweepCopyrightReceiptReviews({
          now: retirementCutoff,
          batchSize: 1,
          maxBatches: 1,
        })
        preservedDuringSweep = await readCopyrightReceiptReview(receipt.id)
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
    expect((await readCopyrightReceiptReview(sentinel.id))?.review_retirement_check_at).toEqual(
      expect.any(Date),
    )
    expect(preservedDuringSweep).toMatchObject({
      review_decision: 'rejected',
      review_rationale_ciphertext: 'v1:test-rationale',
    })
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
      reviewedAt: new Date(oldReview.getTime() + 86_400_000),
    })
    let retired = 0
    const restore = afterPostgresTransactionQueryForTest(
      '/* requireStandaloneCopyrightReceiptPreservation */',
      values => values.includes(receipt.id),
      async () => {
        const result = await sweepCopyrightReceiptReviews({
          now: retirementCutoff,
          batchSize: 1,
          maxBatches: 1,
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
    const nextReviewedAt = new Date(oldReview.getTime() + 86_400_000)
    const next = await seedCopyrightReceiptReview({
      reviewerId: reviewer.id,
      reviewedAt: nextReviewedAt,
    })
    const result = await sweepCopyrightReceiptReviews({
      now: retirementCutoff,
      batchSize: 1,
      maxBatches: 1,
    })
    expect(result.retired).toBe(1)
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      amazon_ses_message_id: receipt.sesMessageId,
      review_decision: null,
      reviewed_by_id: null,
      reviewed_at: null,
      review_rationale_ciphertext: null,
    })
    expect(await readCopyrightReceiptReview(next.id)).toMatchObject({
      review_decision: 'rejected',
      reviewed_by_id: reviewer.id,
      reviewed_at: nextReviewedAt,
      review_rationale_ciphertext: 'v1:test-rationale',
    })
    expect(await peekCopyrightReceiptReviewRetirementCandidate(retirementCutoff)).toBe(next.id)
    const continuation = await sweepCopyrightReceiptReviews({
      now: retirementCutoff,
      batchSize: 1,
      maxBatches: 1,
    })
    expect(continuation.retired).toBe(1)
    expect(await readCopyrightReceiptReview(next.id)).toMatchObject({
      amazon_ses_message_id: next.sesMessageId,
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
    await sweepCopyrightReceiptReviews({ now: retirementCutoff, batchSize: 1, maxBatches: 1 })
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
    expect(await peekCopyrightReceiptReviewRetirementCandidate(retirementCutoff)).toBe(receipt.id)
    await sweepCopyrightReceiptReviews({ now: retirementCutoff, batchSize: 1, maxBatches: 1 })
    expect((await readCopyrightReceiptReview(receipt.id))?.review_decision).toBe('rejected')
    await releaseCopyrightEmailReceiptPreservationHold(reviewer, receipt.id, hold.id)
    expect(await isCopyrightReceiptReviewRetirementEligible(receipt.id)).toBe(false)
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
    await sweepCopyrightReceiptReviews({ now: retirementCutoff, batchSize: 1, maxBatches: 1 })
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
    expect(await isCopyrightReceiptReviewRetirementEligible(receipt.id)).toBe(false)
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      review_decision: 'rejected',
      review_rationale_ciphertext: 'v1:test-rationale',
    })
    expect(await retireOldCopyrightReceiptRationale(rationaleId)).toBe(1)
    await sweepCopyrightReceiptReviews({
      batchSize: 1,
      maxBatches: 1,
      now: retirementCutoff,
    })
    expect(await readCopyrightReceiptReview(receipt.id)).toMatchObject({
      review_decision: null,
      review_rationale_ciphertext: null,
    })
  })
})
