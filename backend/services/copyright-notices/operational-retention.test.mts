import { describe, expect, it } from 'vitest'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  positionCopyrightOperationalCursor,
  readCopyrightExecutionResult,
  readCopyrightOperationalRow,
  seedCopyrightExecutionAttemptPair,
  seedCopyrightFormScreeningAttemptPair,
  seedCopyrightGuestCapabilityLifecycle,
  seedCopyrightGuestCapabilitySubmission,
  seedUnusedCopyrightGuestCapability,
} from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightIntakeLegalDelivery,
  readCopyrightIntakeAuditReview,
  readCopyrightIntakeAuditRecommendation,
  readCopyrightIntakeRetentionState,
  seedCopyrightIntakeLegalDelivery,
  seedCopyrightIntakeAuditReview,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { createRetentionSignedInForm } from '@voucha/test-helpers/services/copyright-notices/retention-signed-in-form'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake, ErasedCopyrightEmailIntakeReplay } from './email-intakes.mts'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright operational retention', () => {
  const bucket = useFakeCopyrightEvidenceBucket()

  it.each(['action', 'delivery'] as const)(
    'preserves the latest %s attempt and waits 180 days from each terminal result',
    async kind => {
      const workItemId =
        kind === 'action'
          ? (await createCopyrightNoticeSchemaFixture()).actionIntentId
          : await seedCopyrightIntakeLegalDelivery(
              (await createRetentionParsedEmail('delivery')).id,
            )
      const { priorId, latestId } = await seedCopyrightExecutionAttemptPair(kind, workItemId, {
        priorTerminalAt: future(150),
      })
      const sweepKind = kind === 'action' ? 'action_attempts' : 'delivery_attempts'
      await positionCopyrightOperationalCursor(sweepKind, priorId)
      const options = { now: future(181), retentionDays: 180, batchSize: 10, maxBatches: 10 }
      await sweepCopyrightOperationalRetention(sweepKind, options)
      expect(await readCopyrightOperationalRow(sweepKind, priorId)).toBe(true)
      expect(await readCopyrightExecutionResult(kind, priorId)).toBe(true)

      await positionCopyrightOperationalCursor(sweepKind, priorId)
      await sweepCopyrightOperationalRetention(sweepKind, { ...options, now: future(331) })
      expect(await readCopyrightOperationalRow(sweepKind, priorId)).toBe(false)
      expect(await readCopyrightExecutionResult(kind, priorId)).toBe(false)
      expect(await readCopyrightOperationalRow(sweepKind, latestId)).toBe(true)
      expect(await readCopyrightExecutionResult(kind, latestId)).toBe(true)
    },
  )

  it('retains recent or latest form screening attempts and deletes an old superseded attempt', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionSignedInForm(notice.posterId)
    const { priorId, latestId } = await seedCopyrightFormScreeningAttemptPair(intake.id, {
      priorTerminalAt: future(100),
    })
    await positionCopyrightOperationalCursor('form_screening_attempts', priorId)
    const options = { now: future(181), retentionDays: 180, batchSize: 10, maxBatches: 10 }
    await sweepCopyrightOperationalRetention('form_screening_attempts', options)
    expect(await readCopyrightOperationalRow('form_screening_attempts', priorId)).toBe(true)

    await positionCopyrightOperationalCursor('form_screening_attempts', priorId)
    await sweepCopyrightOperationalRetention('form_screening_attempts', {
      ...options,
      now: future(281),
    })
    expect(await readCopyrightOperationalRow('form_screening_attempts', priorId)).toBe(false)
    expect(await readCopyrightOperationalRow('form_screening_attempts', latestId)).toBe(true)
  })

  it('waits 90 days after guest capability expiration and skips both reference types', async () => {
    const notice = await createRetentionMinimalCase()
    const unused = await seedUnusedCopyrightGuestCapability(notice.noticeId, future(20))
    const submitted = await seedUnusedCopyrightGuestCapability(notice.noticeId)
    const issued = await seedUnusedCopyrightGuestCapability(notice.noticeId)
    await seedCopyrightGuestCapabilitySubmission(notice.noticeId, submitted)
    await seedCopyrightGuestCapabilityLifecycle(notice.noticeId, issued)
    await positionCopyrightOperationalCursor('guest_capabilities', unused)
    const options = { now: future(91), retentionDays: 90, batchSize: 10, maxBatches: 10 }
    await sweepCopyrightOperationalRetention('guest_capabilities', options)
    expect(await readCopyrightOperationalRow('guest_capabilities', unused)).toBe(true)

    await positionCopyrightOperationalCursor('guest_capabilities', unused)
    await sweepCopyrightOperationalRetention('guest_capabilities', { ...options, now: future(111) })
    expect(await readCopyrightOperationalRow('guest_capabilities', unused)).toBe(false)
    expect(await readCopyrightOperationalRow('guest_capabilities', submitted)).toBe(true)
    expect(await readCopyrightOperationalRow('guest_capabilities', issued)).toBe(true)
  })

  it('deletes old unlinked email evidence and keeps the SES receipt for exact replay', async () => {
    const intake = await createRetentionParsedEmail('unlinked')
    const key = intake.raw_storage_key
    bucket.put(key, { versions: 2, deleteMarker: true })
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    await sweepUnlinkedCopyrightEmailIntakes({
      now: future(89),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    })
    expect(bucket.countVersions(key)).toBe(3)
    expect((await readCopyrightIntakeRetentionState(intake.id)).intakeExists).toBe(true)

    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    const expired = {
      now: future(91),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    }
    bucket.refuse(key)
    await expect(sweepUnlinkedCopyrightEmailIntakes(expired)).rejects.toThrow(
      'Copyright evidence delete refused',
    )
    expect(bucket.countVersions(key)).toBe(3)
    expect((await readCopyrightIntakeRetentionState(intake.id)).intakeExists).toBe(true)
    bucket.allow(key)
    await sweepUnlinkedCopyrightEmailIntakes(expired)
    expect(bucket.countVersions(key)).toBe(0)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: false,
      receiptExists: true,
      hasRawObject: false,
      parseCount: 0,
    })
    await expect(
      createCopyrightEmailIntake({
        sesMessageId: intake.amazon_ses_message_id,
        receivedAt: intake.received_at,
        rawStorageKey: key,
        rawSha256: intake.raw_sha256,
        rawMimeType: intake.raw_mime_type,
        rawByteSize: intake.raw_byte_size,
        sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
        preserveRawEvidence: async () => {
          throw new Error('An erased SES replay must not copy evidence')
        },
      }),
    ).rejects.toBeInstanceOf(ErasedCopyrightEmailIntakeReplay)
    expect(bucket.countVersions(key)).toBe(0)
  })

  it('keeps a linked intake and retains only legal delivery identity after unlinked erasure', async () => {
    const linked = await createRetentionParsedEmail('linked')
    const legal = await createRetentionParsedEmail('legal')
    const notice = await createRetentionMinimalCase()
    await linkTestCopyrightEmailIntake(linked.id, notice.noticeId)
    const deliveryId = await seedCopyrightIntakeLegalDelivery(legal.id)
    const legalDelivery = await readCopyrightIntakeLegalDelivery(deliveryId)
    bucket.put(linked.raw_storage_key)
    bucket.put(legal.raw_storage_key, { versions: 2 })
    await positionCopyrightOperationalCursor('unlinked_email_intakes', linked.id)
    await sweepUnlinkedCopyrightEmailIntakes({
      now: future(91),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    })
    expect(bucket.countVersions(linked.raw_storage_key)).toBe(1)
    expect(bucket.countVersions(legal.raw_storage_key)).toBe(0)
    expect(await readCopyrightIntakeRetentionState(linked.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: true,
    })
    expect(await readCopyrightIntakeRetentionState(legal.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: false,
      parseCount: 0,
      deliveryBody: 'v1:receipt',
    })
    expect(await readCopyrightIntakeLegalDelivery(deliveryId)).toEqual(legalDelivery)
  })

  it('preserves an unlinked staff decision audit row while erasing its raw private intake', async () => {
    const intake = await createRetentionParsedEmail('reviewed')
    const { reviewId, recommendationId } = await seedCopyrightIntakeAuditReview(intake.id)
    const legalReview = await readCopyrightIntakeAuditReview(reviewId)
    const referencedRecommendation = await readCopyrightIntakeAuditRecommendation(recommendationId)
    bucket.put(intake.raw_storage_key)
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    await sweepUnlinkedCopyrightEmailIntakes({
      now: future(91),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    })
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(0)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: false,
      parseCount: 0,
    })
    expect(await readCopyrightIntakeAuditReview(reviewId)).toEqual(legalReview)
    expect(await readCopyrightIntakeAuditRecommendation(recommendationId)).toEqual(
      referencedRecommendation,
    )
  })
})
