import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
  withCopyrightEmailIntakeIdentityLock,
  sweepCopyrightEvidenceRetention,
} from '@services/copyright-notices'
import { enqueueCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { linkCopyrightEmailIntakeToNotice } from '@services/copyright-notices/email-threading'
import { rejectCopyrightEmailCorrespondence } from '@services/copyright-notices/email-correspondence-admission'
import {
  processCopyrightInboundEmail,
  type CopyrightEmailDependencies,
} from './copyright-email.mts'
import { parseSesInboundMime } from './mime.mts'

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

describe('copyright email replay after evidence erasure', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()

  it('never copies an erased MIME object back into the evidence bucket', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createRetentionMinimalCase()
    const sesMessageId = `retention-replay-${crypto.randomUUID()}`
    const rawStorageKey = `email/${sesMessageId}/original.eml`
    const rawSha256 = Buffer.alloc(32, 7)
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey,
      rawSha256,
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    bucket.put(rawStorageKey)
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)
    await rejectCopyrightEmailCorrespondence({
      currentUser: entry.moderator,
      intakeId: intake.id,
      kind: 'supplement',
      rationale: 'The reply is not a filing.',
      recommendationId: null,
      manualFallbackReason: 'No recommendation was available.',
    })
    await expect(
      sweepCopyrightEvidenceRetention({
        now: daysFromNow(400),
        noticeIds: [entry.noticeId],
      }),
    ).resolves.toMatchObject({ erased: 1, failed: [] })
    expect(bucket.countVersions(rawStorageKey)).toBe(0)

    const copy = vi.fn<CopyrightEmailDependencies['copySesInboundObjectToCopyrightEvidence']>(
      async () => {
        bucket.put(rawStorageKey)
        return rawStorageKey
      },
    )
    const job = { sesMessageId, objectKey: `copyright-incoming/${sesMessageId}` }
    const dependencies: CopyrightEmailDependencies = {
      withCopyrightEmailIntakeIdentityLock,
      createCopyrightEmailIntake,
      copySesInboundObjectToCopyrightEvidence: copy,
      loadSesInboundObjectAndHash: async () => ({
        rawMime: Readable.from([Buffer.alloc(12)]),
        digest: Promise.resolve({
          sha256: rawSha256,
          byteSize: 12,
          sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
        }),
        receivedAt: new Date(),
        sourceIdentity: { eTag: 'test-etag' },
      }),
      loadSesInboundObjectVersion: async () => {
        throw new Error('expired replay loaded MIME')
      },
      parseSesInboundMime,
      recordCopyrightEmailParse,
      enqueueCopyrightEmailIntake,
    }
    await processCopyrightInboundEmail(job, dependencies)
    expect(copy).not.toHaveBeenCalled()
    expect(bucket.countVersions(rawStorageKey)).toBe(0)

    await expect(
      processCopyrightInboundEmail(job, {
        ...dependencies,
        loadSesInboundObjectAndHash: async () => ({
          rawMime: Readable.from([Buffer.alloc(12)]),
          digest: Promise.resolve({
            sha256: Buffer.alloc(32, 9),
            byteSize: 12,
            sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
          }),
          receivedAt: new Date(),
          sourceIdentity: { eTag: 'test-etag' },
        }),
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(copy).not.toHaveBeenCalled()
    expect(bucket.countVersions(rawStorageKey)).toBe(0)
  })

  it('waits for the erasure transaction before deciding whether an inbound retry may copy', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createRetentionMinimalCase()
    const sesMessageId = `retention-race-${crypto.randomUUID()}`
    const rawStorageKey = `email/${sesMessageId}/original.eml`
    const rawSha256 = Buffer.alloc(32, 4)
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey,
      rawSha256,
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    bucket.put(rawStorageKey)
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)
    await rejectCopyrightEmailCorrespondence({
      currentUser: entry.moderator,
      intakeId: intake.id,
      kind: 'supplement',
      rationale: 'The reply is not a filing.',
      recommendationId: null,
      manualFallbackReason: 'No recommendation was available.',
    })
    const deleting = Promise.withResolvers<void>()
    const resumeDelete = Promise.withResolvers<void>()
    const workerAttempted = Promise.withResolvers<void>()
    bucket.beforeNextDelete(async () => {
      deleting.resolve()
      await resumeDelete.promise
    })
    const sweep = sweepCopyrightEvidenceRetention({
      now: daysFromNow(400),
      noticeIds: [entry.noticeId],
    })
    await Promise.race([
      deleting.promise,
      sweep.then(() => {
        throw new Error('Erasure finished before the S3 deletion barrier')
      }),
    ])
    const copy = vi.fn<CopyrightEmailDependencies['copySesInboundObjectToCopyrightEvidence']>(
      async () => {
        bucket.put(rawStorageKey)
        return rawStorageKey
      },
    )
    const retry = processCopyrightInboundEmail(
      {
        sesMessageId,
        objectKey: `copyright-incoming/${sesMessageId}`,
      },
      {
        withCopyrightEmailIntakeIdentityLock: async (messageId, effect) => {
          const result = withCopyrightEmailIntakeIdentityLock(messageId, effect)
          workerAttempted.resolve()
          return result
        },
        createCopyrightEmailIntake,
        copySesInboundObjectToCopyrightEvidence: copy,
        loadSesInboundObjectAndHash: async () => ({
          rawMime: Readable.from([Buffer.alloc(12)]),
          digest: Promise.resolve({
            sha256: rawSha256,
            byteSize: 12,
            sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
          }),
          receivedAt: new Date(),
          sourceIdentity: { eTag: 'test-etag' },
        }),
        loadSesInboundObjectVersion: async () => {
          throw new Error('expired retry loaded MIME')
        },
        parseSesInboundMime,
        recordCopyrightEmailParse,
        enqueueCopyrightEmailIntake,
      },
    )
    await workerAttempted.promise
    resumeDelete.resolve()
    await expect(sweep).resolves.toMatchObject({ erased: 1, failed: [] })
    await retry
    expect(copy).not.toHaveBeenCalled()
    expect(bucket.countVersions(rawStorageKey)).toBe(0)
  })
})
