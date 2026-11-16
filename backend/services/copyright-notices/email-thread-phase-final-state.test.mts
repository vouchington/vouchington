import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import { readCopyrightThreadRetirementBound } from '@voucha/test-helpers/copyright-thread-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createCommittedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-committed-intake'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { deriveCopyrightEmailThread } from './email-thread-derive.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('copyright email committed reference final state', () => {
  useCopyrightOperationalCursorReservation()
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
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: `claimant-${randomUUID()}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Committed immutable headers.',
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      replyReferences: input.references,
      attachments: [],
    })
    const before = await readCopyrightThreadReferenceState(intake.id)
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    await expect(
      sweepUnlinkedCopyrightEmailIntakes({
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
    const parent = await createCommittedCopyrightEmailIntake({
      messageId: parentMessageId,
    })
    await linkTestCopyrightEmailIntake(parent.id, notice.noticeId)
    const messageId = `<seed-${randomUUID()}@example.test>`
    const intake = await createCommittedCopyrightEmailIntake({
      messageId,
      replyReferences: [parentMessageId],
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId, 'thread', notice.moderator.id)
    const input = {
      intakeId: intake.id,
      messageId,
      inReplyTo: [] as string[],
      references: [parentMessageId],
    }
    const rows = buildCopyrightEmailThreadReferenceRows(input)
    await expect(deriveCopyrightEmailThread(input, rows)).resolves.toMatchObject({
      noticeId: notice.noticeId,
    })
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    await sweepCopyrightCaseThreads({
      now: new Date(Date.now() + 181 * DAY_MS),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 100,
    })
    expect(await readCopyrightThreadRetirementBound(notice.noticeId)).not.toBeNull()
    const after = await readCopyrightThreadReferenceState(intake.id)
    await expect(deriveCopyrightEmailThread(input, rows)).resolves.toBeNull()
    await expect(recordCopyrightEmailThreadReferences(input)).resolves.toBeNull()
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(after)
  })
})
