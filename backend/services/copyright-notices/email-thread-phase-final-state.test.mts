import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import { readCopyrightThreadRetirementBound } from '@voucha/test-helpers/copyright-thread-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { admitCopyrightEmailReferenceFacts } from './email-thread-reference-facts.mts'
import { deriveCopyrightEmailThread } from './email-thread-derive.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'
import { seedCommittedCopyrightThreadRetirement } from '@voucha/test-helpers/copyright-thread-retirement-fixture'

const DAY_MS = 24 * 60 * 60 * 1000

describe('copyright email committed reference final state', () => {
  it('leaves an erased unlinked intake without a derived case link', async () => {
    const sesMessageId = `ses-phase-erasure-${randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: randomBytes(32),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    const input = {
      intakeId: intake.id,
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [] as string[],
      references: [] as string[],
    }
    const rows = buildCopyrightEmailThreadReferenceRows(input)
    expect(await admitCopyrightEmailReferenceFacts(intake.id, rows)).toBe(true)
    const before = await readCopyrightThreadReferenceState(intake.id)
    const scope1 = createCopyrightOperationalScope([intake.id])
    await expect(
      sweepUnlinkedCopyrightEmailIntakes({
        scope: scope1,
        now: new Date(Date.now() + 91 * DAY_MS),
        retentionDays: 90,
        childLimit: 20,
        maxBatches: 1,
      }),
    ).resolves.toMatchObject({ erased: 1 })
    await expect(deriveCopyrightEmailThread(input, rows)).resolves.toBeNull()
    await expect(recordCopyrightEmailThreadReferences(input)).resolves.toBeNull()
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
  })

  it('does not derive a case link after the linked intake crosses retirement high-water', async () => {
    const notice = await createRetentionMinimalCase()
    const parentMessageId = `<parent-${randomUUID()}@example.test>`
    const parent = await createRetentionThreadSeedEmail('phase-retirement-parent', {
      sesMessageId: notice.initialEmailSesMessageId,
      messageId: parentMessageId,
    })
    await linkTestCopyrightEmailIntake(parent.id, notice.noticeId)
    const intake = await createRetentionThreadSeedEmail('phase-retirement', {
      messageId: `<seed-${randomUUID()}@example.test>`,
      replyReferences: [parentMessageId],
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId, 'thread', notice.moderator.id)
    const input = {
      intakeId: intake.id,
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [parentMessageId],
      references: [] as string[],
    }
    const rows = buildCopyrightEmailThreadReferenceRows(input)
    expect(await admitCopyrightEmailReferenceFacts(intake.id, rows)).toBe(true)
    await expect(deriveCopyrightEmailThread(input, rows)).resolves.toMatchObject({
      noticeId: notice.noticeId,
    })
    await seedCommittedCopyrightThreadRetirement(notice.noticeId, [parent.id, intake.id])
    expect(await readCopyrightThreadRetirementBound(notice.noticeId)).not.toBeNull()
    const after = await readCopyrightThreadReferenceState(intake.id)
    const links = await readCopyrightEmailIntakeNoticeLinks(intake.id)
    const ancestors = await readCopyrightEmailAncestorIds(intake.id)
    expect(after).toEqual({ tokenId: null, referenceCount: 0 })
    await expect(deriveCopyrightEmailThread(input, rows)).resolves.toBeNull()
    await expect(recordCopyrightEmailThreadReferences(input)).rejects.toMatchObject({
      status: 409,
      code: 'copyright_email_thread_changed',
    })
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(after)
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual(links)
    expect(await readCopyrightEmailAncestorIds(intake.id)).toEqual(ancestors)
  })
})
