import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import {
  raceCopyrightIntakeLinkWithOwnerBatch,
  tryCopyrightCaseErasureExclusiveLock,
  useCopyrightEvidenceGetBarrier,
} from '@voucha/test-helpers/copyright-retention-intake-lifetime'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { loadCopyrightEmailRawEvidence } from './email-raw-evidence.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

describe('copyright intake erasure lifetime locks', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  const getBarrier = useCopyrightEvidenceGetBarrier()
  const setRetentionClock = useCopyrightRetentionWorkClock()

  it('rejects a thread link submitted during case erasure', async () => {
    const entry = await createRetentionMinimalCase()
    const rawStorageKey = `email/${crypto.randomUUID()}/original.eml`
    const linked = await createIntake(rawStorageKey)
    bucket.put(rawStorageKey)
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: linked.id,
        noticeId: entry.noticeId,
        linkKind: 'initial',
      }),
    ).toBe(true)
    const late = await createIntake(`email/${crypto.randomUUID()}/original.eml`)

    await setRetentionClock(new Date('2035-01-01T00:00:00.000Z'))
    const deleting = Promise.withResolvers<void>()
    const resumeDelete = Promise.withResolvers<void>()
    bucket.beforeNextDelete(async () => {
      deleting.resolve()
      await resumeDelete.promise
    })
    const erasure = advanceCopyrightRetentionWorkPages(entry.noticeId)
    let lateLink: Promise<boolean> | undefined
    let lateLinkResult: Promise<{ value?: boolean; err?: unknown }> | undefined
    try {
      await Promise.race([
        deleting.promise,
        erasure.then(() => {
          throw new Error('Case erasure completed before entering its provider delete')
        }),
      ])
      expect(await tryCopyrightCaseErasureExclusiveLock(entry.noticeId)).toBe(false)
      lateLink = linkCopyrightEmailIntakeToNotice({
        intakeId: late.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      })
      lateLinkResult = lateLink.then(
        value => ({ value }),
        err => ({ err }),
      )
      resumeDelete.resolve()
      expect(await erasure).toContain('erased')
      expect(await lateLinkResult).toMatchObject({
        err: { message: 'copyright intake erasure is in progress' },
      })
    } finally {
      resumeDelete.resolve()
      await erasure.catch(() => undefined)
      await lateLink?.catch(() => undefined)
      await lateLinkResult
    }
  })

  it('rechecks linked-case admission after locking an intake', async () => {
    const entry = await createRetentionMinimalCase()
    const intake = await createIntake(`email/${crypto.randomUUID()}/original.eml`)
    await appendCopyrightEmailIntakeRecommendation({
      intakeId: intake.id,
      inputSha256: Buffer.alloc(32, 11),
      promptVersion: 'retention-lifetime-race-v1',
      model: 'test-model',
      structuredOutput: { summary: 'Scoped key fixture' },
    })

    await expect(
      raceCopyrightIntakeLinkWithOwnerBatch({ intakeId: intake.id, noticeId: entry.noticeId }),
    ).resolves.toEqual({
      linkCommittedDuringRace: true,
      committedLinkExists: true,
      batchError: 'Copyright intake case erasure is in progress',
    })
  })

  it('keeps the shared case lifetime through a blocked real S3 evidence read', async () => {
    const entry = await createRetentionMinimalCase()
    const bytes = Buffer.from('From: claimant@example.test\r\n\r\nEvidence body')
    const rawStorageKey = `email/${crypto.randomUUID()}/original.eml`
    const intake = await createIntake(rawStorageKey, bytes)
    bucket.put(rawStorageKey)
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'initial',
      }),
    ).toBe(true)
    const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
    const get = getBarrier.blockNextGet(rawStorageKey, bytes)
    const read = loadCopyrightEmailRawEvidence(intake.id, moderator)
    try {
      await get.started
      expect(await tryCopyrightCaseErasureExclusiveLock(entry.noticeId)).toBe(false)
    } finally {
      get.release()
      await read.catch(() => undefined)
    }
    await expect(read).resolves.toMatchObject({ bytes })
  })
})

async function createIntake(rawStorageKey: string, bytes = Buffer.from('raw email fixture')) {
  return (
    await createCopyrightEmailIntake({
      sesMessageId: `retention-lifetime-${crypto.randomUUID()}`,
      receivedAt: new Date(),
      rawStorageKey,
      rawSha256: createHash('sha256').update(bytes).digest(),
      rawMimeType: 'message/rfc822',
      rawByteSize: bytes.byteLength,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
  ).intake
}
