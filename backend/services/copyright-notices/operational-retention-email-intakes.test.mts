import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/index'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightIntakeLegalDelivery,
  readCopyrightIntakeAuditReview,
  readCopyrightIntakeAuditRecommendation,
  seedCopyrightIntakeLegalDelivery,
  seedCopyrightIntakeAuditReview,
  seedTestCopyrightAncestorEdge,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake, ErasedCopyrightEmailIntakeReplay } from './email-intakes.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'
import { placeCopyrightEmailReceiptPreservationHold } from './retention-receipt-preservation.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright operational email intake retention', () => {
  const bucket = useCopyrightEvidenceBucket()
  it('preserves private intake evidence while its standalone final review is held', async () => {
    const reviewer = await createTestUserDirect({ extraRoles: ['moderator'] })
    const intake = await createRetentionParsedEmail('held-standalone-receipt')
    await seedCopyrightIntakeAuditReview(intake.id)
    await placeCopyrightEmailReceiptPreservationHold(reviewer, intake.id, 'court_request')
    const scope1 = createCopyrightOperationalScope([intake.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope1,
      now: future(91),
      retentionDays: 90,
      childLimit: 2,
      maxBatches: 1,
    })
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: true,
    })
  })
  it('keeps the replay fence if a database child write fails after S3 deletion', async () => {
    const intake = await createRetentionParsedEmail('post-s3-database-failure')
    await bucket.put(intake.raw_storage_key)
    const scope2 = createCopyrightOperationalScope([intake.id])
    const options = { now: future(91), retentionDays: 90, childLimit: 2, maxBatches: 1 }
    await sweepUnlinkedCopyrightEmailIntakes({ ...options, scope: scope2 }) // commits erasure intent before S3
    await expect(
      sweepUnlinkedCopyrightEmailIntakes({
        scope: scope2,
        ...options,
        queryAfterStorage: transaction =>
          rejectQuery(
            transaction,
            statement => statement.includes('/* deleteUnlinkedCopyrightEmailRecommendations */'),
            'injected child delete failure after S3',
          ),
      }),
    ).rejects.toThrow('injected child delete failure after S3')
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(0)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: true,
    })
    await expect(
      createCopyrightEmailIntake({
        sesMessageId: intake.amazon_ses_message_id,
        receivedAt: intake.received_at,
        rawStorageKey: intake.raw_storage_key,
        rawSha256: intake.raw_sha256,
        rawMimeType: intake.raw_mime_type,
        rawByteSize: intake.raw_byte_size,
        sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
      }),
    ).rejects.toBeInstanceOf(ErasedCopyrightEmailIntakeReplay)
  })

  it('keeps a linked intake and retains legal delivery after unlinked source erasure', async () => {
    const notice = await createRetentionMinimalCase()
    const linked = await createRetentionParsedEmail('linked', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const legal = await createRetentionParsedEmail('legal')
    await linkTestCopyrightEmailIntake(linked.id, notice.noticeId)
    const deliveryId = await seedCopyrightIntakeLegalDelivery(legal.id)
    const legalDelivery = await readCopyrightIntakeLegalDelivery(deliveryId)
    await bucket.put(linked.raw_storage_key)
    await bucket.put(legal.raw_storage_key, { versions: 2 })
    const scope3 = createCopyrightOperationalScope([linked.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope3,
      now: future(91),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    })
    const scope4 = createCopyrightOperationalScope([legal.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope4,
      now: future(91),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    })
    expect(await bucket.countVersions(linked.raw_storage_key)).toBe(1)
    expect(await bucket.countVersions(legal.raw_storage_key)).toBe(0)
    expect(await readCopyrightIntakeRetentionState(linked.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: true,
    })
    expect(await readCopyrightIntakeRetentionState(legal.id)).toMatchObject({
      intakeExists: false,
      receiptExists: true,
      hasRawObject: false,
      parseCount: 0,
      deliveryBody: 'v1:receipt',
    })
    expect(await readCopyrightIntakeLegalDelivery(deliveryId)).toEqual(legalDelivery)
  })

  it('erases an unlinked intake while keeping both directions of linked-case ancestry', async () => {
    const notice = await createRetentionMinimalCase()
    const linked = await createRetentionParsedEmail('linked-ancestry', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const unlinked = await createRetentionParsedEmail('unlinked-ancestry')
    const other = await createRetentionParsedEmail('other-ancestry')
    await linkTestCopyrightEmailIntake(linked.id, notice.noticeId)
    await seedTestCopyrightAncestorEdge(unlinked.id, linked.id)
    await seedTestCopyrightAncestorEdge(linked.id, unlinked.id)
    await seedTestCopyrightAncestorEdge(unlinked.id, other.id)
    await bucket.put(unlinked.raw_storage_key)
    const scope5 = createCopyrightOperationalScope([unlinked.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope5,
      now: future(91),
      retentionDays: 90,
      childLimit: 1,
      maxBatches: 30,
    })
    expect(await readCopyrightIntakeRetentionState(unlinked.id)).toMatchObject({
      intakeExists: false,
      receiptExists: true,
      ancestorCount: 2,
    })
    expect(await bucket.countVersions(unlinked.raw_storage_key)).toBe(0)
  })

  it('preserves an unlinked staff decision audit row while erasing its raw private intake', async () => {
    const intake = await createRetentionParsedEmail('reviewed')
    const { reviewId, recommendationId } = await seedCopyrightIntakeAuditReview(intake.id)
    const legalReview = await readCopyrightIntakeAuditReview(reviewId)
    const referencedRecommendation = await readCopyrightIntakeAuditRecommendation(recommendationId)
    await bucket.put(intake.raw_storage_key)
    const scope6 = createCopyrightOperationalScope([intake.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope6,
      now: future(91),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    })
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(0)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: false,
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
