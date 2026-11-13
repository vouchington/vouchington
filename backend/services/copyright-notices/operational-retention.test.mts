import {
  seedCopyrightThreadTokenAtForTest,
  readCopyrightThreadTokenForIntake,
} from '@voucha/test-helpers/copyright-thread-retention'
import { describe, expect, it } from 'vitest'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import { insertConcurrentCopyrightPartySubmissions } from '@voucha/test-helpers/copyright-operational-concurrency'
import { createTestUserDirect } from '@voucha/test-helpers/entities/index'
import {
  createCopyrightOperationalScope,
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
import { seedCopyrightIntakeLegalDelivery } from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { createRetentionSignedInForm } from '@voucha/test-helpers/services/copyright-notices/retention-signed-in-form'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake, ErasedCopyrightEmailIntakeReplay } from './email-intakes.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright operational retention', () => {
  const bucket = useCopyrightEvidenceBucket()

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
      const scope1 = createCopyrightOperationalScope([priorId])
      const options = { now: future(181), retentionDays: 180, batchSize: 10, maxBatches: 10 }
      await sweepCopyrightOperationalRetention(sweepKind, { ...options, scope: scope1 })
      expect(await readCopyrightOperationalRow(sweepKind, priorId)).toBe(true)
      expect(await readCopyrightExecutionResult(kind, priorId)).toBe(true)

      const scope2 = createCopyrightOperationalScope([priorId])
      await sweepCopyrightOperationalRetention(sweepKind, {
        scope: scope2,
        ...options,
        now: future(331),
      })
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
    const scope3 = createCopyrightOperationalScope([priorId])
    const options = { now: future(181), retentionDays: 180, batchSize: 10, maxBatches: 10 }
    await sweepCopyrightOperationalRetention('form_screening_attempts', {
      ...options,
      scope: scope3,
    })
    expect(await readCopyrightOperationalRow('form_screening_attempts', priorId)).toBe(true)

    const scope4 = createCopyrightOperationalScope([priorId])
    await sweepCopyrightOperationalRetention('form_screening_attempts', {
      scope: scope4,
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
    const scope5 = createCopyrightOperationalScope([unused])
    const options = { now: future(91), retentionDays: 90, batchSize: 10, maxBatches: 10 }
    await sweepCopyrightOperationalRetention('guest_capabilities', { ...options, scope: scope5 })
    expect(await readCopyrightOperationalRow('guest_capabilities', unused)).toBe(true)

    for (const candidate of [unused, submitted, issued]) {
      const scope6 = createCopyrightOperationalScope([candidate])
      await sweepCopyrightOperationalRetention('guest_capabilities', {
        scope: scope6,
        ...options,
        now: future(111),
      })
    }
    expect(await readCopyrightOperationalRow('guest_capabilities', unused)).toBe(false)
    expect(await readCopyrightOperationalRow('guest_capabilities', submitted)).toBe(true)
    expect(await readCopyrightOperationalRow('guest_capabilities', issued)).toBe(false)
    expect(await readCopyrightGuestCapabilityIdentity(issued)).toBe(true)
  })

  it('prunes an unreferenced thread digest and retains one cited by a live intake', async () => {
    const orphanId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1_000),
    })
    expect(await readCopyrightOperationalRow('email_thread_tokens', orphanId)).toBe(true)
    const intake = await createRetentionParsedEmail('referenced-thread-token')
    await recordCopyrightEmailThreadReferences({
      intakeId: intake.id,
      messageId: `<referenced-${crypto.randomUUID()}@example.test>`,
      inReplyTo: [],
      references: [],
    })
    const referenced = await readCopyrightThreadTokenForIntake(intake.id, 'message_id')
    expect(referenced).toBeTruthy()
    const options = { now: future(91), retentionDays: 90, batchSize: 1, maxBatches: 1 }

    const scope8 = createCopyrightOperationalScope([orphanId])
    await expect(
      sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
        ...options,
        scope: scope8,
      }),
    ).resolves.toMatchObject({
      scanned: 1,
      deleted: 1,
    })
    expect(await readCopyrightOperationalRow('email_thread_tokens', orphanId)).toBe(false)

    const scope9 = createCopyrightOperationalScope([referenced!.id])
    await expect(
      sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
        ...options,
        scope: scope9,
      }),
    ).resolves.toMatchObject({
      scanned: 1,
      deleted: 0,
    })
    expect(await readCopyrightOperationalRow('email_thread_tokens', referenced!.id)).toBe(true)
  })

  it('deletes old unlinked email evidence and keeps the SES receipt for exact replay', async () => {
    const intake = await createRetentionParsedEmail('unlinked')
    const key = intake.raw_storage_key
    await bucket.put(key, { versions: 2, deleteMarker: true })
    const scope10 = createCopyrightOperationalScope([intake.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope10,
      now: future(89),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    })
    expect(await bucket.countVersions(key)).toBe(3)
    expect((await readCopyrightIntakeRetentionState(intake.id)).intakeExists).toBe(true)

    const scope11 = createCopyrightOperationalScope([intake.id])
    const expired = {
      now: future(91),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    }
    await bucket.refuse(key)
    await expect(
      sweepUnlinkedCopyrightEmailIntakes({ ...expired, scope: scope11 }),
    ).rejects.toThrow('Copyright evidence delete refused')
    expect(await bucket.countVersions(key)).toBe(3)
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
    await bucket.allow(key)
    await sweepUnlinkedCopyrightEmailIntakes({ ...expired, scope: scope11 })
    expect(await bucket.countVersions(key)).toBe(0)
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
    expect(await bucket.countVersions(key)).toBe(0)
  })
})
