import { randomUUID } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { waitForCopyrightEmailMarkerBeforeWriter } from '@voucha/test-helpers/copyright-email-retention-lock-order'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { copyrightEmailPromotionInput } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import { createCopyrightUnlinkedEmailSweepScope } from '@voucha/test-helpers/copyright-unlinked-email-cursor'
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
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright unlinked email retention serializable boundaries', () => {
  const bucket = useCopyrightEvidenceBucket()
  it('keeps a promoted intake when the receipt decision commits before erasure marking', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    await bucket.put(intake.raw_storage_key)
    const scope = createCopyrightUnlinkedEmailSweepScope([intake.id])
    const beforeCursor = { ...scope.cursor }
    const inspected = Promise.withResolvers<void>()
    const releaseErasure = Promise.withResolvers<void>()
    const { result } = await observeTestPostgresClientQueries(
      async () => {
        const erasure = sweepUnlinkedCopyrightEmailIntakes({
          now: future(91),
          retentionDays: 90,
          childLimit: 2,
          maxBatches: 1,
          scope,
        })
        void erasure.catch(inspected.reject)
        try {
          await Promise.race([inspected.promise, erasure.then(() => undefined)])
          const promoted = await promoteCopyrightEmailIntake(input)
          releaseErasure.resolve()
          return { erasure: await erasure, promoted }
        } finally {
          releaseErasure.resolve()
          await erasure.catch(() => undefined)
        }
      },
      async query => {
        if (
          !query.text.includes('/* inspectUnlinkedCopyrightEmailIntakeActivity */') ||
          !query.values.includes(intake.id)
        )
          return
        inspected.resolve()
        await releaseErasure.promise
      },
    )
    expect(result.erasure).toEqual({ scanned: 0, erased: 0, hasMore: false })
    expect(scope.cursor).toEqual(beforeCursor)
    expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toBeNull()
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: result.promoted.noticeId, link_kind: 'initial' },
    ])
    expect(
      await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
    ).toMatchObject({ reviews: 1, evidence: 1, notice_targets: 1 })
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(1)
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
    const scope = createCopyrightUnlinkedEmailSweepScope([intake.id])
    const beforeCursor = { ...scope.cursor }
    const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
    const { erasure, appended } = await waitForCopyrightEmailMarkerBeforeWriter(
      intake.id,
      () =>
        sweepUnlinkedCopyrightEmailIntakes({
          now: future(91),
          retentionDays: 90,
          childLimit: 2,
          maxBatches: 1,
          scope,
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
    expect(scope.cursor.cursor_record_id).toBe(beforeCursor.cursor_record_id)
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
    'ends an unlinked erasure run after a %s abort without advancing its page',
    async code => {
      const foreign = await createRetentionParsedEmail('foreign-unlinked-page-conflict')
      const intake = await createRetentionParsedEmail('unlinked-page-conflict')
      await bucket.put(intake.raw_storage_key)
      await bucket.put(foreign.raw_storage_key)
      await commitCopyrightEmailReceiptErasureMarker(intake.id)
      const options = { now: future(91), retentionDays: 90, childLimit: 20, maxBatches: 1 }
      const foreignBefore = await readCopyrightIntakeRetentionState(foreign.id)
      const scope = createCopyrightUnlinkedEmailSweepScope([intake.id])
      const beforeCursor = { ...scope.cursor }
      const before = await readCopyrightIntakeRetentionState(intake.id)
      const erasedAt = await readCopyrightEmailReceiptErasedAt(intake.id)
      expect(erasedAt).not.toBeNull()
      const failure = Object.assign(new Error('unlinked erasure serialization conflict'), {
        code,
      })
      let reachedPostStorageWrite = false
      expect(before.intakeExists).toBe(true)
      expect(beforeCursor.cursor_record_id).toBeNull()
      const result = await sweepUnlinkedCopyrightEmailIntakes({
        ...options,
        scope,
        queryAfterStorage: transaction =>
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
      })
      expect(reachedPostStorageWrite).toBe(true)
      expect(result).toEqual({ scanned: 0, erased: 0, hasMore: false })
      expect(scope.cursor).toEqual(beforeCursor)
      expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
      expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toEqual(erasedAt)
      expect(await bucket.countVersions(intake.raw_storage_key)).toBe(0)
      expect(await readCopyrightEmailReceiptErasedAt(foreign.id)).toBeNull()
      expect(await readCopyrightIntakeRetentionState(foreign.id)).toEqual(foreignBefore)
      expect(await bucket.countVersions(foreign.raw_storage_key)).toBe(1)
    },
  )
})
