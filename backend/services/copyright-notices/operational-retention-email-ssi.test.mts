import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  waitForCopyrightEmailMarkerBeforeWriter,
  writeCopyrightEmailDuringErasure,
} from '@voucha/test-helpers/copyright-email-retention-lock-order'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import { readCopyrightUnlinkedEmailOperationalCursor } from '@voucha/test-helpers/copyright-unlinked-email-cursor'
import {
  readCopyrightIntakeAuditRecommendation,
  readCopyrightIntakeRecommendationCount,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  readCopyrightEmailReceiptErasedAt,
  readCopyrightIntakeRetentionState,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright unlinked email retention serializable boundaries', () => {
  useCopyrightOperationalCursorReservation()
  const bucket = useFakeCopyrightEvidenceBucket()
  it('ends an erasure run when a concurrent source write wins the intake', async () => {
    const intake = await createRetentionParsedEmail('concurrent-retention-lock-order')
    bucket.put(intake.raw_storage_key)
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    const beforeCursor = await readCopyrightUnlinkedEmailOperationalCursor()
    const before = await readCopyrightIntakeRetentionState(intake.id)
    const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
    const { erasure, recommendationId } = await writeCopyrightEmailDuringErasure(intake.id, () =>
      sweepUnlinkedCopyrightEmailIntakes({
        now: future(91),
        retentionDays: 90,
        childLimit: 2,
        maxBatches: 1,
      }),
    )
    expect(erasure).toEqual({ scanned: 0, erased: 0, hasMore: false })
    expect(await readCopyrightUnlinkedEmailOperationalCursor()).toEqual(beforeCursor)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(beforeReferences)
    expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toBeNull()
    expect(await readCopyrightIntakeAuditRecommendation(recommendationId)).toMatchObject({
      id: recommendationId,
    })
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(1)
    expect(bucket.deleteRequests()).toBe(0)
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
    ).resolves.toMatchObject({ intake: { id: intake.id }, isNew: false })
  })
  it('orders a waiting recommendation against the unlinked erasure marker', async () => {
    const intake = await createRetentionParsedEmail('recommendation-after-erasure-marker')
    bucket.put(intake.raw_storage_key)
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    const beforeCursor = await readCopyrightUnlinkedEmailOperationalCursor()
    const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
    const { erasure, appended } = await waitForCopyrightEmailMarkerBeforeWriter(
      intake.id,
      () =>
        sweepUnlinkedCopyrightEmailIntakes({
          now: future(91),
          retentionDays: 90,
          childLimit: 2,
          maxBatches: 1,
        }),
      () =>
        appendCopyrightEmailIntakeRecommendation({
          intakeId: intake.id,
          inputSha256: Buffer.alloc(32, 8),
          promptVersion: 'marker-race',
          model: 'test-model',
          structuredOutput: { summary: 'Late recommendation' },
        }),
    )
    const markerErased = (await readCopyrightEmailReceiptErasedAt(intake.id)) !== null
    const recommendationCount = await readCopyrightIntakeRecommendationCount(intake.id)
    expect([
      {
        erasure: { scanned: 1, erased: 1, hasMore: true },
        appended: false,
        markerErased: true,
        recommendationCount: 0,
      },
      {
        erasure: { scanned: 0, erased: 0, hasMore: false },
        appended: true,
        markerErased: false,
        recommendationCount: 1,
      },
    ]).toContainEqual({ erasure, appended, markerErased, recommendationCount })
    expect(await readCopyrightUnlinkedEmailOperationalCursor()).toEqual(beforeCursor)
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(beforeReferences)
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(1)
    expect(bucket.deleteRequests()).toBe(0)
  })

  it('rejects reference admission after the unlinked erasure marker wins', async () => {
    const intake = await createRetentionParsedEmail('reference-after-erasure-marker')
    bucket.put(intake.raw_storage_key)
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    const beforeCursor = await readCopyrightUnlinkedEmailOperationalCursor()
    const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
    const input = {
      intakeId: intake.id,
      messageId: `<late-${randomUUID()}@example.test>`,
      inReplyTo: [],
      references: [],
    }
    const { erasure, appended: writer } = await waitForCopyrightEmailMarkerBeforeWriter(
      intake.id,
      () =>
        sweepUnlinkedCopyrightEmailIntakes({
          now: future(91),
          retentionDays: 90,
          childLimit: 20,
          maxBatches: 1,
        }),
      () =>
        recordCopyrightEmailThreadReferences(input)
          .then(value => ({ status: 'fulfilled' as const, value }))
          .catch((err: unknown) => ({ status: 'rejected' as const, error: err })),
      '/* insertCopyrightEmailThreadReferences */',
    )
    expect(erasure).toEqual({ scanned: 1, erased: 1, hasMore: true })
    expect(writer).toMatchObject({
      status: 'rejected',
      error: { status: 409, cause: { code: '40001' } },
    })
    expect(await readCopyrightEmailReceiptErasedAt(intake.id)).not.toBeNull()
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(beforeReferences)
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightUnlinkedEmailOperationalCursor()).toEqual(beforeCursor)
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(1)
    expect(bucket.deleteRequests()).toBe(0)
  })
  it('ends an unlinked erasure run after a serialization abort without advancing its page', async () => {
    const intake = await createRetentionParsedEmail('unlinked-page-conflict')
    bucket.put(intake.raw_storage_key)
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    const options = { now: future(91), retentionDays: 90, childLimit: 20, maxBatches: 1 }
    await expect(sweepUnlinkedCopyrightEmailIntakes(options)).resolves.toMatchObject({
      scanned: 1,
      erased: 1,
    })
    const beforeCursor = await readCopyrightUnlinkedEmailOperationalCursor()
    const before = await readCopyrightIntakeRetentionState(intake.id)
    const erasedAt = await readCopyrightEmailReceiptErasedAt(intake.id)
    expect(erasedAt).not.toBeNull()
    const failure = Object.assign(new Error('unlinked erasure serialization conflict'), {
      code: '40001',
    })
    let reachedChildDelete = false
    const result = await sweepUnlinkedCopyrightEmailIntakes({
      ...options,
      queryAfterStorage: transaction =>
        rejectQuery(
          transaction,
          statement => {
            if (!statement.includes('/* deleteUnlinkedCopyrightEmailRecommendations */'))
              return false
            reachedChildDelete = true
            return true
          },
          failure,
        ),
    })
    expect(reachedChildDelete).toBe(true)
    expect(result).toEqual({ scanned: 0, erased: 0, hasMore: false })
    expect(await readCopyrightUnlinkedEmailOperationalCursor()).toEqual(beforeCursor)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
    expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toEqual(erasedAt)
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(0)
  })
})
