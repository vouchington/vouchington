import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import { observeOwnedCopyrightSweep } from '@voucha/test-helpers/copyright-thread-retention-assertions'
import {
  readCopyrightIntakeRetentionState,
  commitCopyrightEmailReceiptErasureMarker,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  seedCopyrightIntakeAuditReview,
  seedCopyrightIntakeLegalDelivery,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { ErasedCopyrightEmailIntakeReplay } from './email-intakes.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

describe('copyright partial evidence erasure', () => {
  const bucket = useCopyrightEvidenceBucket()
  it('commits partial version erasure and retains metadata on an owned aborted page', async () => {
    const intake = await createRetentionParsedEmail('many-versions')
    const notice = await createRetentionMinimalCase()
    await bucket.put(intake.raw_storage_key, { versions: 6 })
    const siblingKey = `${intake.raw_storage_key}/other`
    await bucket.put(siblingKey, { versions: 2 })
    await commitCopyrightEmailReceiptErasureMarker(intake.id)
    const before = await readCopyrightIntakeRetentionState(intake.id)
    const scope = createCopyrightOperationalScope([intake.id])
    const options = {
      now: new Date(Date.now() + 91 * 86_400_000),
      retentionDays: 90,
      childLimit: 2,
      maxBatches: 1,
      scope,
    }
    // Replay guards are unconditional probes of the already committed erasure decision.
    await expect(
      recordCopyrightEmailParse(intake, { status: 'failed', error: 'late parser replay' }),
    ).rejects.toBeInstanceOf(ErasedCopyrightEmailIntakeReplay)
    await expect(
      linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: notice.noticeId,
        linkKind: 'initial',
      }),
    ).resolves.toBe(false)
    await expect(seedCopyrightIntakeAuditReview(intake.id)).rejects.toThrow(
      'erased copyright email intake cannot accept a recommendation',
    )
    await expect(seedCopyrightIntakeLegalDelivery(intake.id)).rejects.toThrow(
      'copyright email intake is under retention erasure',
    )
    const observed = await observeOwnedCopyrightSweep(scope, async () => {
      const first = await sweepUnlinkedCopyrightEmailIntakes(options)
      const versions = await bucket.countVersions(intake.raw_storage_key)
      const afterFirst = await readCopyrightIntakeRetentionState(intake.id)
      let result = first
      for (let page = 0; page < 10 && result.hasMore; page += 1) {
        result = await sweepUnlinkedCopyrightEmailIntakes(options)
      }
      return { first, versions, afterFirst }
    })
    const native = expect.objectContaining({
      ownedIds: [intake.id],
      ownerPhase: expect.stringContaining('Copyright'),
      error: expect.objectContaining({ code: '40001' }),
    })
    const firstCommitted = {
      first: { scanned: 1, erased: 1, hasMore: true },
      versions: 4,
      afterFirst: before,
    }
    const complete = {
      intakeExists: false,
      receiptExists: true,
      hasRawObject: false,
      parseCount: 0,
      attachmentCount: 0,
      deliveryBody: null,
      ancestorCount: 0,
    }
    expect([
      { first: firstCommitted, state: complete, versions: 0, failures: [], rollback: null },
      { first: firstCommitted, state: complete, versions: 0, failures: [native], rollback: true },
      ...[0, 2, 4].map(versions => ({
        first: firstCommitted,
        state: before,
        versions,
        failures: [native],
        rollback: true,
      })),
      ...[4, 6].map(versions => ({
        first: { first: { scanned: 0, erased: 0, hasMore: false }, versions, afterFirst: before },
        state: before,
        versions,
        failures: [native],
        rollback: true,
      })),
    ]).toContainEqual({
      first: observed.result,
      state: await readCopyrightIntakeRetentionState(intake.id),
      versions: await bucket.countVersions(intake.raw_storage_key),
      failures: observed.failures,
      rollback: observed.failures.length
        ? isDeepStrictEqual(scope.cursor, observed.abortedCursor)
        : null,
    })
    expect(observed.observerErrors).toEqual([])
    expect(await bucket.countVersions(siblingKey)).toBe(2)
  })
})
