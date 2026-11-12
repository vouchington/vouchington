import { randomUUID } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { waitForCopyrightEmailMarkerBeforeWriter } from '@voucha/test-helpers/copyright-email-retention-lock-order'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { copyrightEmailPromotionInput } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import { withCopyrightEmailErasureTransaction } from '@voucha/test-helpers/copyright-email-erasure-transaction'
import {
  readCopyrightIntakeRecommendationCount,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  commitCopyrightEmailReceiptErasureMarker,
  readCopyrightEmailReceiptErasedAt,
  readCopyrightIntakeRetentionState,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { eraseIntakePage, type EdgeCursor } from './operational-retention-email-intake-page.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright unlinked email retention serializable boundaries', () => {
  const bucket = useCopyrightEvidenceBucket()
  it('rejects promotion when the erasure marker commits first', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    await bucket.put(intake.raw_storage_key)
    await commitCopyrightEmailReceiptErasureMarker(intake.id)
    const promotion = await promoteCopyrightEmailIntake(input)
      .then(value => ({ status: 'fulfilled' as const, value }))
      .catch((err: unknown) => ({ status: 'rejected' as const, error: err }))
    expect(promotion).toMatchObject({ status: 'rejected', error: { status: 404 } })
    expect(await readCopyrightEmailReceiptErasedAt(intake.id)).not.toBeNull()
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(
      await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
    ).toMatchObject({ reviews: 0, evidence: 0, notice_targets: 0 })
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(1)
  })
  it('orders a waiting recommendation against the unlinked erasure marker', async () => {
    const intake = await createRetentionParsedEmail('recommendation-after-erasure-marker')
    await bucket.put(intake.raw_storage_key)
    const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
    const { erasure, appended } = await waitForCopyrightEmailMarkerBeforeWriter(
      intake.id,
      () =>
        withCopyrightEmailErasureTransaction(transaction =>
          eraseIntakePage(transaction, intake.id, future(1), 2, { phase: null, edgeId: null }),
        ),
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
    expect(markerErased && recommendationCount > 0).toBe(false)
    expect(recommendationCount).toBe(appended.status === 'fulfilled' && appended.value ? 1 : 0)
    expect(erasure.status === 'fulfilled' ? erasure.value.erased : false).toBe(markerErased)
    const erasureError =
      erasure.status === 'rejected' ? (erasure.reason as { code?: string }) : null
    expect(erasureError === null || ['40001', '40P01'].includes(erasureError.code ?? '')).toBe(true)
    const writerError =
      appended.status === 'rejected'
        ? (appended.reason as { code?: string; status?: number })
        : null
    expect(
      writerError === null ||
        ['40001', '40P01'].includes(writerError.code ?? '') ||
        (writerError.status === 409 && writerError.code === 'COPYRIGHT_EMAIL_THREAD_CHANGED'),
    ).toBe(true)
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(beforeReferences)
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(1)
  })

  it('does not admit references after the unlinked erasure marker commits', async () => {
    const intake = await createRetentionParsedEmail('reference-after-erasure-marker')
    await bucket.put(intake.raw_storage_key)
    const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
    const input = {
      intakeId: intake.id,
      messageId: `<late-${randomUUID()}@example.test>`,
      inReplyTo: [],
      references: [],
    }
    await commitCopyrightEmailReceiptErasureMarker(intake.id)
    const writer = await recordCopyrightEmailThreadReferences(input)
      .then(value => ({ status: 'fulfilled' as const, value }))
      .catch((err: unknown) => ({ status: 'rejected' as const, error: err }))
    expect(writer).toEqual({ status: 'fulfilled', value: null })
    expect(await readCopyrightEmailReceiptErasedAt(intake.id)).not.toBeNull()
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(beforeReferences)
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(1)
  })
  it.each(['40001', '40P01'])(
    'rolls back its owned intake after a post-storage %s abort',
    async code => {
      const foreign = await createRetentionParsedEmail('foreign-unlinked-page-conflict')
      const intake = await createRetentionParsedEmail('unlinked-page-conflict')
      await bucket.put(intake.raw_storage_key)
      await bucket.put(foreign.raw_storage_key)
      await commitCopyrightEmailReceiptErasureMarker(intake.id)
      const foreignBefore = await readCopyrightIntakeRetentionState(foreign.id)
      const cursor: EdgeCursor = { phase: null, edgeId: null }
      const beforeCursor = { ...cursor }
      const before = await readCopyrightIntakeRetentionState(intake.id)
      const erasedAt = await readCopyrightEmailReceiptErasedAt(intake.id)
      expect(erasedAt).not.toBeNull()
      const failure = Object.assign(new Error('unlinked erasure serialization conflict'), {
        code,
      })
      let reachedPostStorageWrite = false
      expect(before.intakeExists).toBe(true)
      expect(beforeCursor.edgeId).toBeNull()
      await expect(
        withCopyrightEmailErasureTransaction(transaction =>
          eraseIntakePage(
            rejectQuery(
              transaction,
              statement => {
                if (!statement.includes('/* clearUnlinkedCopyrightEmailStorageObject */'))
                  return false
                reachedPostStorageWrite = true
                return true
              },
              failure,
            ),
            intake.id,
            future(1),
            20,
            cursor,
          ),
        ),
      ).rejects.toMatchObject({ code })
      expect(reachedPostStorageWrite).toBe(true)
      expect(cursor).toEqual(beforeCursor)
      expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
      expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toEqual(erasedAt)
      expect(await bucket.countVersions(intake.raw_storage_key)).toBe(0)
      expect(await readCopyrightEmailReceiptErasedAt(foreign.id)).toBeNull()
      expect(await readCopyrightIntakeRetentionState(foreign.id)).toEqual(foreignBefore)
      expect(await bucket.countVersions(foreign.raw_storage_key)).toBe(1)
    },
  )
})
