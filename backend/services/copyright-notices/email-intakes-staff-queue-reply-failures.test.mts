import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readCopyrightEmailIntakeResponses } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  bounceTestCopyrightEmailIntakeReply,
  declineTestCopyrightEmailIntake,
} from '@voucha/test-helpers/services/copyright-notices/declined-email-intake'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import { markCopyrightDeliveryIntentSent, prepareCopyrightEmailDelivery } from './index.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'
import { createParsedCopyrightEmailIntake } from './email-intake-test-fixtures.mts'

describe('copyright email intake queue reply failures', () => {
  useCopyrightIntakeEnvironment()
  it('lists a declined intake whose reply failed or bounced with its reason and wait, and hides the rest', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-staff-email-intake-reply-failures') === 'parent') {
      await runIsolatedDatabaseCase('copyright-staff-email-intake-reply-failures')
      return
    }

    const anchor = new Date('2020-01-01T00:00:00.000Z').getTime()
    const at = (offset: number) => new Date(anchor + offset)
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const awaiting = await createParsedCopyrightEmailIntake(at(1))
    const pending = await declineTestCopyrightEmailIntake({ receivedAt: at(2) })
    const failed = await declineTestCopyrightEmailIntake({ receivedAt: at(3) })
    const sent = await declineTestCopyrightEmailIntake({ receivedAt: at(4) })
    const bounced = await declineTestCopyrightEmailIntake({ receivedAt: at(5) })
    const pendingReceipt = (await readCopyrightEmailIntakeResponses(pending.intakeId)).find(
      row => row.delivery_kind === 'email_intake_received',
    )!
    await failTestCopyrightDeliveryIntent(pendingReceipt.id)
    await failTestCopyrightDeliveryIntent(failed.intentId)
    const { leaseToken } = await prepareCopyrightEmailDelivery(sent.intentId)
    await markCopyrightDeliveryIntentSent({
      intentId: sent.intentId,
      leaseToken,
      sesMessageId: `ses-sent-${crypto.randomUUID()}`,
    })
    await bounceTestCopyrightEmailIntakeReply(bounced.intentId)

    const { intakes } = await searchCopyrightStaffEmailIntakes(moderator, { limit: 10 })

    expect(intakes.map(intake => [intake.id, intake.waiting_reason])).toEqual([
      [awaiting.id, 'awaiting_review'],
      [failed.intakeId, 'reply_failed'],
      [bounced.intakeId, 'reply_bounced'],
    ])
    expect(intakes.map(intake => intake.id)).not.toContain(pending.intakeId)
    expect(intakes.map(intake => intake.id)).not.toContain(sent.intakeId)
    // An unreviewed intake waits from its receipt; a failed reply waits from the failure itself.
    expect(intakes[0]!.waiting_since).toEqual(at(1))
    for (const intake of intakes.slice(1)) {
      expect(intake.waiting_since.getTime()).toBeGreaterThan(anchor + 1_000_000)
      expect(intake.waiting_since.getTime()).toBeLessThanOrEqual(Date.now())
    }
  }, 240_000)
})
