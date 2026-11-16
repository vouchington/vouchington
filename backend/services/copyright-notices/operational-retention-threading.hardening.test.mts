import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import { readCopyrightThreadReferenceState } from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightThreadTokenForIntake } from '@voucha/test-helpers/copyright-thread-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { raceCopyrightThreadWithCorrespondence } from '@voucha/test-helpers/copyright-purge-writer-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

describe('copyright thread erasure concurrent legal writers', () => {
  useCopyrightOperationalCursorReservation()
  it('clears the expired matched token and commits a concurrent correspondence without deadlock', async () => {
    const entry = await createRetentionMinimalCase()
    const messageId = `<retention-race-${randomUUID()}@example.test>`
    const intake = await createRetentionParsedEmail('thread-generation-order', {
      messageId,
      sesMessageId: entry.initialEmailSesMessageId,
    })
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'initial',
        matchedReference: messageId,
      }),
    ).toBe(true)
    expect(await readCopyrightThreadTokenForIntake(intake.id, 'matched')).not.toBeNull()
    await positionCopyrightOperationalCursor('email_thread_references', entry.noticeId)
    const options = {
      now: new Date(Date.now() + 181 * 24 * 60 * 60 * 1_000),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 1,
    }
    let remaining = (await readCopyrightThreadReferenceState(intake.id)).referenceCount
    expect(remaining).toBeGreaterThan(0)
    for (let step = 0; step < 100 && remaining > 0; step += 1) {
      await sweepCopyrightCaseThreads(options)
      remaining = (await readCopyrightThreadReferenceState(intake.id)).referenceCount
    }
    expect(remaining).toBe(0)
    expect(await readCopyrightThreadTokenForIntake(intake.id, 'matched')).not.toBeNull()
    const { page, message } = await raceCopyrightThreadWithCorrespondence(entry.noticeId, () =>
      sweepCopyrightCaseThreads(options),
    )
    expect(page).toEqual({ scanned: 1, deleted: 0, hasMore: true })
    expect(await readCopyrightThreadTokenForIntake(intake.id, 'matched')).toBeNull()
    expect((await readCopyrightThreadReferenceState(intake.id)).referenceCount).toBe(0)
    const aggregate = await getCopyrightNoticePrivateAggregate(entry.noticeId)
    expect(aggregate?.correspondence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: message.id, body_ciphertext: message.body_ciphertext }),
      ]),
    )
  })
})
