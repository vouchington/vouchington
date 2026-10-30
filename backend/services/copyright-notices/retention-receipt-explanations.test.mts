import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import {
  createCopyrightKeyNotice,
  readCopyrightKeyReservation,
  useCopyrightKeyObjectFaults,
} from '@voucha/test-helpers/copyright-encryption-keys'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  linkHistoricalCopyrightReceipt,
  retireHistoricalCopyrightPrivateIntake,
  positionCopyrightReceiptExplanationCursor,
  readCopyrightEmailOwnerKeyIds,
  readCopyrightReceiptExplanationEligibility,
  readCopyrightReceiptExplanationState,
  seedHistoricalCopyrightReceiptExplanation,
  seedCopyrightReceiptDelivery,
} from '@voucha/test-helpers/copyright-receipt-retirement'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import {
  createCopyrightEmailIntake,
  copyrightEmailIntakePurpose,
  ErasedCopyrightEmailIntakeReplay,
} from './email-intakes.mts'
import { prepareCopyrightEncryptionKey, openCopyrightSecrets } from './encryption-keys.mts'
import { readCopyrightEncryptionKeyObject } from './encryption-key-objects.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import { sweepCopyrightReceiptExplanations } from './retention-receipt-explanations.mts'
import {
  placeCopyrightEmailReceiptPreservationHold,
  releaseCopyrightEmailReceiptPreservationHold,
} from './retention-receipt-preservation.mts'

async function moderator() {
  const user = await createTestUser()
  return { ...user, roles: ['moderator'] } as typeof user
}

describe('standalone copyright receipt explanation retirement', () => {
  useCopyrightIntakeEnvironment()
  useCopyrightKeyObjectFaults()
  useCopyrightOperationalCursorReservation()

  it('retires standalone review facts and key while retaining the SES replay fence', async () => {
    const staff = await moderator()
    const receipt = await seedHistoricalCopyrightReceiptExplanation(staff.id)
    const before = await readCopyrightReceiptExplanationState(receipt.id)
    expect(before).toMatchObject({
      amazon_ses_message_id: receipt.sesMessageId,
      review_decision: 'rejected',
      reviewed_by_id: staff.id,
      live_intake_exists: false,
      key_id: receipt.keyId,
      key_destroyed_at: null,
    })
    expect(before?.erased_at).toBeInstanceOf(Date)
    expect(await readCopyrightReceiptExplanationEligibility(receipt.id)).toBe(true)
    {
      await using receiptSecrets = await openCopyrightSecrets({ kind: 'receipt', id: receipt.id })
      expect(
        JSON.parse(
          receiptSecrets.decryptSecret(
            receipt.ciphertext,
            copyrightEmailIntakePurpose(receipt.sesMessageId),
          ),
        ),
      ).toEqual({
        rationale: receipt.reason,
        manual_fallback_reason: null,
      })
    }

    await positionCopyrightReceiptExplanationCursor(receipt.id)
    const first = await sweepCopyrightReceiptExplanations({ maxBatches: 1 })
    expect(first).toMatchObject({ scanned: 1, retired: 0 })
    expect(
      (await readCopyrightReceiptExplanationState(receipt.id))
        ?.final_explanation_erasure_started_at,
    ).toBeInstanceOf(Date)
    const second = await sweepCopyrightReceiptExplanations({ maxBatches: 1 })
    expect(second).toMatchObject({ scanned: 1, retired: 1 })
    const after = await readCopyrightReceiptExplanationState(receipt.id)
    expect(after).toMatchObject({
      amazon_ses_message_id: receipt.sesMessageId,
      review_decision: null,
      reviewed_by_id: null,
      reviewed_at: null,
      review_rationale_ciphertext: null,
      live_intake_exists: false,
    })
    expect(after?.final_explanation_erased_at).toBeInstanceOf(Date)
    expect(after?.key_id).toBeNull()
    expect((await readCopyrightEmailOwnerKeyIds(receipt.id)).receipt_key_id).toBeNull()
    expect(await readCopyrightKeyReservation(receipt.keyId)).toBeNull()
    await expect(readCopyrightEncryptionKeyObject(receipt.keyId)).rejects.toMatchObject({
      name: 'NoSuchKey',
    })
    await expect(openCopyrightSecrets({ kind: 'receipt', id: receipt.id })).rejects.toThrow(
      'Copyright encryption owner key is unavailable',
    )
    await expect(
      createCopyrightEmailIntake({
        sesMessageId: receipt.sesMessageId,
        receivedAt: new Date(),
        rawStorageKey: receipt.rawStorageKey,
        rawSha256: receipt.rawSha256,
        rawMimeType: 'message/rfc822',
        rawByteSize: 12,
        sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
      }),
    ).rejects.toBeInstanceOf(ErasedCopyrightEmailIntakeReplay)
  })

  it('uses the SQL calendar-month cutoff on opposite sides of the owner clock', async () => {
    const staff = await moderator()
    const boundary = shiftUtcCalendarMonths(new Date(), -72)
    const older = await seedHistoricalCopyrightReceiptExplanation(staff.id, {
      reviewedAt: new Date(boundary.getTime() - 2 * 86_400_000),
    })
    const younger = await seedHistoricalCopyrightReceiptExplanation(staff.id, {
      reviewedAt: new Date(boundary.getTime() + 2 * 86_400_000),
    })
    expect(await readCopyrightReceiptExplanationEligibility(older.id)).toBe(true)
    expect(await readCopyrightReceiptExplanationEligibility(younger.id)).toBe(false)
    await positionCopyrightReceiptExplanationCursor(younger.id)
    expect(await sweepCopyrightReceiptExplanations({ maxBatches: 1 })).toMatchObject({
      scanned: 1,
      retired: 0,
    })
    expect(
      (await readCopyrightReceiptExplanationState(younger.id))?.review_rationale_ciphertext,
    ).toBe(younger.ciphertext)
  })

  it('keeps private-intake and final-receipt keys distinct for the real staff decision', async () => {
    const staff = await moderator()
    const intake = await createParsedCopyrightEmailIntake()
    await rejectCopyrightEmailIntake({
      currentUser: staff,
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'Staff made the final decision without an agent recommendation.',
      rationale: 'The submitted message does not identify the protected work.',
    })
    const keys = await readCopyrightEmailOwnerKeyIds(intake.id)
    expect(keys.intake_key_id).toBeTruthy()
    expect(keys.receipt_key_id).toBeTruthy()
    expect(keys.receipt_key_id).not.toBe(keys.intake_key_id)
    const state = await readCopyrightReceiptExplanationState(intake.id)
    await using receiptSecrets = await openCopyrightSecrets({ kind: 'receipt', id: intake.id })
    expect(
      JSON.parse(
        receiptSecrets.decryptSecret(
          state!.review_rationale_ciphertext!,
          copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
        ),
      ),
    ).toMatchObject({
      rationale: 'The submitted message does not identify the protected work.',
    })
    await using intakeSecrets = await openCopyrightSecrets({ kind: 'intake', id: intake.id })
    expect(() =>
      intakeSecrets.decryptSecret(
        state!.review_rationale_ciphertext!,
        copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
      ),
    ).toThrow('does not belong')
  })

  it('holds an old explanation and restarts its clock on release', async () => {
    const staff = await moderator()
    const receipt = await seedHistoricalCopyrightReceiptExplanation(staff.id)
    const hold = await placeCopyrightEmailReceiptPreservationHold(
      staff,
      receipt.id,
      'court_request',
    )
    expect(await readCopyrightReceiptExplanationEligibility(receipt.id)).toBe(false)
    await positionCopyrightReceiptExplanationCursor(receipt.id)
    expect(await sweepCopyrightReceiptExplanations({ maxBatches: 1 })).toMatchObject({
      scanned: 1,
      retired: 0,
    })
    expect(
      (await readCopyrightReceiptExplanationState(receipt.id))?.review_rationale_ciphertext,
    ).toBe(receipt.ciphertext)
    await releaseCopyrightEmailReceiptPreservationHold(staff, receipt.id, hold.token)
    const released = await readCopyrightReceiptExplanationState(receipt.id)
    expect(released?.last_preservation_hold_released_at).toBeInstanceOf(Date)
    expect(await readCopyrightReceiptExplanationEligibility(receipt.id)).toBe(false)
    await positionCopyrightReceiptExplanationCursor(receipt.id)
    expect(await sweepCopyrightReceiptExplanations({ maxBatches: 1 })).toMatchObject({
      scanned: 1,
      retired: 0,
    })
    expect((await readCopyrightReceiptExplanationState(receipt.id))?.key_destroyed_at).toBeNull()
  })

  it('keeps review facts while the private intake is still live', async () => {
    const staff = await moderator()
    const receipt = await seedHistoricalCopyrightReceiptExplanation(staff.id, {
      withLiveIntake: true,
    })
    expect(await readCopyrightReceiptExplanationEligibility(receipt.id)).toBe(false)
    await positionCopyrightReceiptExplanationCursor(receipt.id)
    expect(await sweepCopyrightReceiptExplanations({ maxBatches: 1 })).toMatchObject({
      scanned: 1,
      retired: 0,
    })
    expect((await readCopyrightReceiptExplanationState(receipt.id))?.review_decision).toBe(
      'rejected',
    )
  })

  it('blocks recent delivery, unresolved delivery, and a case link', async () => {
    const staff = await moderator()
    const sent = await seedHistoricalCopyrightReceiptExplanation(staff.id, { withLiveIntake: true })
    await seedCopyrightReceiptDelivery(sent.id, 'sent')
    await retireHistoricalCopyrightPrivateIntake(sent.id)
    expect((await readCopyrightReceiptExplanationState(sent.id))?.live_intake_exists).toBe(false)
    expect(
      (await readCopyrightReceiptExplanationState(sent.id))?.last_delivery_activity_at,
    ).toBeInstanceOf(Date)
    expect(await readCopyrightReceiptExplanationEligibility(sent.id)).toBe(false)
    await positionCopyrightReceiptExplanationCursor(sent.id)
    expect(await sweepCopyrightReceiptExplanations({ maxBatches: 1 })).toMatchObject({
      scanned: 1,
      retired: 0,
    })

    const pending = await seedHistoricalCopyrightReceiptExplanation(staff.id, {
      withLiveIntake: true,
    })
    await seedCopyrightReceiptDelivery(pending.id, 'pending')
    expect(await readCopyrightReceiptExplanationEligibility(pending.id)).toBe(false)
    await positionCopyrightReceiptExplanationCursor(pending.id)
    expect(await sweepCopyrightReceiptExplanations({ maxBatches: 1 })).toMatchObject({
      scanned: 1,
      retired: 0,
    })

    const unlinkedControl = await seedHistoricalCopyrightReceiptExplanation(staff.id, {
      decision: 'approved',
    })
    expect(await readCopyrightReceiptExplanationEligibility(unlinkedControl.id)).toBe(true)

    await using caseKey = await prepareCopyrightEncryptionKey('notice')
    const notice = await createCopyrightKeyNotice(caseKey)
    const linked = await seedHistoricalCopyrightReceiptExplanation(staff.id, {
      withLiveIntake: true,
      decision: 'approved',
    })
    await linkHistoricalCopyrightReceipt(linked.id, notice.noticeId)
    await retireHistoricalCopyrightPrivateIntake(linked.id)
    expect((await readCopyrightReceiptExplanationState(linked.id))?.live_intake_exists).toBe(false)
    expect(await readCopyrightReceiptExplanationEligibility(linked.id)).toBe(false)
    await positionCopyrightReceiptExplanationCursor(linked.id)
    expect(await sweepCopyrightReceiptExplanations({ maxBatches: 1 })).toMatchObject({
      scanned: 1,
      retired: 0,
    })
  })
})
