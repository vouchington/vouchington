import {
  assertCopyrightRecommendationMarkerRace,
  assertCopyrightReferenceMarkerRace,
} from '@voucha/test-helpers/copyright-email-marker-race-outcomes'
import { observeOwnedCopyrightSweep } from '@voucha/test-helpers/copyright-thread-retention-assertions'
import { assertCopyrightPromotionErasureOutcome } from '@voucha/test-helpers/copyright-promotion-erasure-outcomes'
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
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import { readCopyrightUnlinkedEmailOperationalCursor } from '@voucha/test-helpers/copyright-unlinked-email-cursor'
import { readCopyrightThreadReferenceState } from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  readCopyrightEmailReceiptErasedAt,
  commitCopyrightEmailReceiptErasureMarker,
  readCopyrightIntakeRetentionState,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { withCopyrightEmailErasureTransaction } from '@voucha/test-helpers/copyright-email-erasure-transaction'
import { eraseIntakePage, type EdgeCursor } from './operational-retention-email-intake-page.mts'
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
    const scope1 = createCopyrightOperationalScope([intake.id])
    const inspected = Promise.withResolvers<void>()
    const releaseErasure = Promise.withResolvers<void>()
    const { result } = await observeTestPostgresClientQueries(
      async () => {
        const erasure = sweepUnlinkedCopyrightEmailIntakes({
          scope: scope1,
          now: future(91),
          retentionDays: 90,
          childLimit: 2,
          maxBatches: 1,
        })
        void erasure.then(() => inspected.resolve()).catch(inspected.reject)
        try {
          await inspected.promise
          const promoted = await promoteCopyrightEmailIntake(input)
            .then(value => ({ status: 'fulfilled' as const, value }))
            .catch((err: unknown) => ({ status: 'rejected' as const, error: err }))
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
    await assertCopyrightPromotionErasureOutcome({
      intakeId: intake.id,
      placementId: input.targets[0]!.placementId,
      scope: scope1,
      erasure: result.erasure,
      promotion: result.promoted,
    })
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(1)
  })
  it('couples overlapping marker and promotion results to committed admission facts', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    await bucket.put(intake.raw_storage_key)
    const scope2 = createCopyrightOperationalScope([intake.id])
    const { erasure, appended: promotion } = await waitForCopyrightEmailMarkerBeforeWriter(
      intake.id,
      () =>
        sweepUnlinkedCopyrightEmailIntakes({
          scope: scope2,
          now: future(91),
          retentionDays: 90,
          childLimit: 2,
          maxBatches: 1,
        }),
      () => promoteCopyrightEmailIntake(input),
      '/* promoteCopyrightEmailIntake:currentDecision */',
    )
    if (erasure.status === 'rejected') throw erasure.reason
    await assertCopyrightPromotionErasureOutcome({
      intakeId: intake.id,
      placementId: input.targets[0]!.placementId,
      scope: scope2,
      erasure: erasure.value,
      promotion:
        promotion.status === 'fulfilled'
          ? promotion
          : { status: 'rejected', error: promotion.reason },
    })
    expect(await bucket.countVersions(intake.raw_storage_key)).toBe(1)
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
    expect.hasAssertions()
    const intake = await createRetentionParsedEmail('recommendation-after-erasure-marker')
    await bucket.put(intake.raw_storage_key)
    const before = await readCopyrightIntakeRetentionState(intake.id)
    const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
    const cursor: EdgeCursor = { phase: null, edgeId: null }
    const { erasure, appended } = await waitForCopyrightEmailMarkerBeforeWriter(
      intake.id,
      () =>
        withCopyrightEmailErasureTransaction(transaction =>
          eraseIntakePage(transaction, intake.id, future(1), 2, cursor),
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
    await assertCopyrightRecommendationMarkerRace({
      intakeId: intake.id,
      storageKey: intake.raw_storage_key,
      erasure,
      appended,
      before,
      beforeReferences,
      cursor,
      bucket,
    })
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
  it('couples fresh reference facts to the overlapping erasure result without partial graph admission', async () => {
    expect.hasAssertions()
    const intake = await createRetentionParsedEmail('reference-after-erasure-marker')
    await bucket.put(intake.raw_storage_key)
    const before = await readCopyrightIntakeRetentionState(intake.id)
    const references = await readCopyrightThreadReferenceState(intake.id)
    const cursor: EdgeCursor = { phase: null, edgeId: null }
    const { erasure, appended: writer } = await waitForCopyrightEmailMarkerBeforeWriter(
      intake.id,
      () =>
        withCopyrightEmailErasureTransaction(transaction =>
          eraseIntakePage(transaction, intake.id, future(1), 20, cursor),
        ),
      () =>
        recordCopyrightEmailThreadReferences({
          intakeId: intake.id,
          messageId: `<late-${randomUUID()}@example.test>`,
          inReplyTo: [],
          references: [],
        }),
      '/* insertCopyrightEmailThreadReferences */',
    )
    await assertCopyrightReferenceMarkerRace({
      intakeId: intake.id,
      storageKey: intake.raw_storage_key,
      erasure,
      writer,
      before,
      references,
      cursor,
      bucket,
    })
  })
  it.each(['40001', '40P01'])(
    'ends an unlinked erasure run after a %s abort without advancing its page',
    async code => {
      const foreign = await createRetentionParsedEmail('foreign-unlinked-page-conflict')
      await bucket.put(foreign.raw_storage_key)
      const foreignBefore = await readCopyrightIntakeRetentionState(foreign.id)
      const intake = await createRetentionParsedEmail('unlinked-page-conflict')
      await bucket.put(intake.raw_storage_key)
      const scope5 = createCopyrightOperationalScope([intake.id])
      const options = { now: future(91), retentionDays: 90, childLimit: 20, maxBatches: 1 }
      await commitCopyrightEmailReceiptErasureMarker(intake.id)
      const beforeCursor = await readCopyrightUnlinkedEmailOperationalCursor(scope5)
      const before = await readCopyrightIntakeRetentionState(intake.id)
      const erasedAt = await readCopyrightEmailReceiptErasedAt(intake.id)
      expect(erasedAt).not.toBeNull()
      const failure = Object.assign(new Error('unlinked erasure serialization conflict'), {
        code,
      })
      let reachedChildDelete = false
      const observed = await observeOwnedCopyrightSweep(scope5, () =>
        sweepUnlinkedCopyrightEmailIntakes({
          scope: scope5,
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
        }),
      )
      expect(observed.result).toEqual({ scanned: 0, erased: 0, hasMore: false })
      expect(await readCopyrightUnlinkedEmailOperationalCursor(scope5)).toEqual(beforeCursor)
      expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
      expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toEqual(erasedAt)
      expect(observed.observerErrors).toEqual([])
      const native = expect.objectContaining({
        ownedIds: [intake.id],
        ownerPhase: expect.stringContaining('Copyright'),
        error: expect.objectContaining({ code: '40001' }),
      })
      expect([
        { reached: true, failures: [], versions: 0 },
        { reached: false, failures: [native], versions: 0 },
        { reached: false, failures: [native], versions: 1 },
      ]).toContainEqual({
        reached: reachedChildDelete,
        failures: observed.failures,
        versions: await bucket.countVersions(intake.raw_storage_key),
      })
      expect(await readCopyrightEmailReceiptErasedAt(foreign.id)).toBeNull()
      expect(await readCopyrightIntakeRetentionState(foreign.id)).toEqual(foreignBefore)
      expect(await bucket.countVersions(foreign.raw_storage_key)).toBe(1)
    },
  )
})
