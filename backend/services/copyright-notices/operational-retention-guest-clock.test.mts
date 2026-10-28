import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  positionCopyrightOperationalCursor,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import { seedUnusedCopyrightGuestCapability } from '@voucha/test-helpers/copyright-operational-guest-capabilities'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright guest capability retention clock', () => {
  useCopyrightOperationalCursorReservation()
  it('keeps the original expiry activity after unused auth material is pruned', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail('guest-clock-thread')
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const before = await readCopyrightThreadReferenceState(intake.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    const capabilityId = await seedUnusedCopyrightGuestCapability(notice.noticeId, future(20))
    await positionCopyrightOperationalCursor('guest_capabilities', capabilityId)
    await sweepCopyrightOperationalRetention('guest_capabilities', {
      now: future(111),
      retentionDays: 90,
      batchSize: 10,
      maxBatches: 10,
    })
    expect(await readCopyrightOperationalRow('guest_capabilities', capabilityId)).toBe(false)

    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    await sweepCopyrightCaseThreads({
      now: future(181),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 100,
    })
    expect((await readCopyrightThreadReferenceState(intake.id)).referenceCount).toBe(
      before.referenceCount,
    )

    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    await sweepCopyrightCaseThreads({
      now: future(201),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 100,
    })
    expect((await readCopyrightThreadReferenceState(intake.id)).referenceCount).toBe(0)
  })
})
