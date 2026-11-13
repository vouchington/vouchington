import {
  observeOwnedCopyrightSweep,
  assertOwnedCopyrightThreadSweep,
} from '@voucha/test-helpers/copyright-thread-retention-assertions'
import { describe, expect, it } from 'vitest'
import {
  createCopyrightOperationalScope,
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
  it('keeps the original expiry activity after unused auth material is pruned', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail('guest-clock-thread', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const before = await readCopyrightThreadReferenceState(intake.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    const capabilityId = await seedUnusedCopyrightGuestCapability(notice.noticeId, future(20))
    const scope1 = createCopyrightOperationalScope([capabilityId])
    await sweepCopyrightOperationalRetention('guest_capabilities', {
      scope: scope1,
      now: future(111),
      retentionDays: 90,
      batchSize: 10,
      maxBatches: 10,
    })
    expect(await readCopyrightOperationalRow('guest_capabilities', capabilityId)).toBe(false)

    const scope2 = createCopyrightOperationalScope([notice.noticeId])
    await sweepCopyrightCaseThreads({
      scope: scope2,
      now: future(181),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 100,
    })
    expect((await readCopyrightThreadReferenceState(intake.id)).referenceCount).toBe(
      before.referenceCount,
    )

    const scope3 = createCopyrightOperationalScope([notice.noticeId])
    const observed = await observeOwnedCopyrightSweep(scope3, () =>
      sweepCopyrightCaseThreads({
        scope: scope3,
        now: future(201),
        replyDays: 180,
        batchSize: 10,
        maxBatches: 100,
      }),
    )
    await assertOwnedCopyrightThreadSweep({
      scope: scope3,
      noticeId: notice.noticeId,
      intakeId: intake.id,
      before,
      observed,
    })
  })
})
