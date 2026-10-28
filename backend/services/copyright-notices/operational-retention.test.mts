import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import { insertConcurrentCopyrightPartySubmissions } from '@voucha/test-helpers/copyright-operational-concurrency'
import { createTestUserDirect } from '@voucha/test-helpers/entities/index'
import {
  positionCopyrightOperationalCursor,
  readCopyrightExecutionResult,
  readCopyrightOperationalRow,
  seedCopyrightExecutionAttemptPair,
  seedCopyrightFormScreeningAttemptPair,
} from '@voucha/test-helpers/copyright-operational-retention'
import {
  readCopyrightGuestCapabilityIdentity,
  seedCopyrightGuestCapabilityLifecycle,
  seedCopyrightGuestCapabilitySubmission,
  seedUnusedCopyrightGuestCapability,
} from '@voucha/test-helpers/copyright-operational-guest-capabilities'
import {
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
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright operational retention', () => {
  useCopyrightOperationalCursorReservation()
  const bucket = useFakeCopyrightEvidenceBucket()

  it('commits concurrent same-case party inserts without a case lock upgrade', async () => {
    const notice = await createRetentionMinimalCase()
    const [first, second] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    const ids = await insertConcurrentCopyrightPartySubmissions(notice.noticeId, [
      first.id,
      second.id,
    ])
    expect(new Set(ids).size).toBe(2)
  })

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

  it('retires an expired used-in-history capability while preserving its legal identity', async () => {
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

    for (const candidate of [unused, submitted, issued]) {
      await positionCopyrightOperationalCursor('guest_capabilities', candidate)
      await sweepCopyrightOperationalRetention('guest_capabilities', {
        ...options,
        now: future(111),
      })
    }
    expect(await readCopyrightOperationalRow('guest_capabilities', unused)).toBe(false)
    expect(await readCopyrightOperationalRow('guest_capabilities', submitted)).toBe(true)
    expect(await readCopyrightOperationalRow('guest_capabilities', issued)).toBe(false)
    expect(await readCopyrightGuestCapabilityIdentity(issued)).toBe(true)
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
          throw new Error('Refused erasure cannot replay evidence')
        },
      }),
    ).rejects.toBeInstanceOf(ErasedCopyrightEmailIntakeReplay)
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

  it('commits partial version erasure while retaining the live pointer until confirmation', async () => {
    const intake = await createRetentionParsedEmail('many-versions')
    const notice = await createRetentionMinimalCase()
    bucket.put(intake.raw_storage_key, { versions: 6 })
    const siblingKey = `${intake.raw_storage_key}/other`
    bucket.put(siblingKey, { versions: 2 })
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    const options = { now: future(91), retentionDays: 90, childLimit: 2, maxBatches: 2 }
    const first = await sweepUnlinkedCopyrightEmailIntakes(options)
    expect(first.hasMore).toBe(true)
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(4)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: true,
    })
    await expect(
      recordCopyrightEmailParse(intake, {
        status: 'failed',
        error: 'late parser replay',
      }),
    ).rejects.toBeInstanceOf(ErasedCopyrightEmailIntakeReplay)
    await expect(
      linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: notice.noticeId,
        linkKind: 'initial',
      }),
    ).resolves.toBe(false)
    await expect(seedCopyrightIntakeAuditReview(intake.id)).rejects.toThrow(
      'copyright email intake is under retention erasure',
    )
    await expect(seedCopyrightIntakeLegalDelivery(intake.id)).rejects.toThrow(
      'copyright email intake is under retention erasure',
    )
    for (let page = 0; page < 10; page += 1) {
      const result = await sweepUnlinkedCopyrightEmailIntakes(options)
      if (!result.hasMore) break
    }
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(0)
    expect(bucket.countVersions(siblingKey)).toBe(2)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: false,
      receiptExists: true,
      hasRawObject: false,
    })
  })
})
