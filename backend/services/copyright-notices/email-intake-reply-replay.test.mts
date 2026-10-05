import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  readTestCopyrightDeliveryIntentReplayEvents,
  readTestCopyrightDeliveryIntentReplayFacts,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intake-reply-replays'
import {
  countCopyrightStaffQueueKeysWithoutNotice,
  failTestCopyrightDeliveryIntent,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  bounceTestCopyrightEmailIntakeReply,
  declineTestCopyrightEmailIntake,
} from '@voucha/test-helpers/services/copyright-notices/declined-email-intake'
import { markCopyrightDeliveryIntentSent, prepareCopyrightEmailDelivery } from './index.mts'
import { replayFailedCopyrightEmailIntakeReply } from './email-intake-reply-replay.mts'

async function createStaff(role = 'moderator') {
  const user = await createTestUser()
  return { ...user, roles: [role] } as typeof user
}

async function declineWithFailedReply() {
  const declined = await declineTestCopyrightEmailIntake()
  await failTestCopyrightDeliveryIntent(declined.intentId)
  return declined
}

describe('replaying the failed reply to a declined email intake', () => {
  it('resets it once, resends the exact stored text, and audits the staff actor', async () => {
    const declined = await declineTestCopyrightEmailIntake()
    const firstSend = await prepareCopyrightEmailDelivery(declined.intentId)
    await failTestCopyrightDeliveryIntent(declined.intentId)
    const failed = await readTestCopyrightDeliveryIntentReplayFacts(declined.intentId)
    const staff = await createStaff()

    await expect(
      replayFailedCopyrightEmailIntakeReply({ currentUser: staff, intakeId: declined.intakeId }),
    ).resolves.toBe(declined.intentId)

    const replayed = await readTestCopyrightDeliveryIntentReplayFacts(declined.intentId)
    expect(failed).toMatchObject({ state: 'failed', delivery_attempt_count: 5 })
    expect(replayed).toMatchObject({
      state: 'pending',
      delivery_attempt_count: 0,
      failed_at: null,
      body_ciphertext: failed.body_ciphertext,
    })
    await expect(readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).resolves.toEqual([
      {
        copyright_notice_id: null,
        change_type: 'delivery_intent_replayed',
        changed_by_id: staff.id,
      },
    ])
    const resend = await prepareCopyrightEmailDelivery(declined.intentId)
    expect(resend).toMatchObject({
      text: firstSend.text,
      subject: firstSend.subject,
      recipientEmail: firstSend.recipientEmail,
    })
    // It is back to pending, so a second replay finds nothing failed and records nothing more.
    await expect(
      replayFailedCopyrightEmailIntakeReply({ currentUser: staff, intakeId: declined.intakeId }),
    ).resolves.toBeNull()
    await expect(
      readTestCopyrightDeliveryIntentReplayEvents(declined.intentId),
    ).resolves.toHaveLength(1)
  })

  it('leaves a reply that is pending, sent, or bounced untouched and unaudited', async () => {
    const pending = await declineTestCopyrightEmailIntake()
    const sent = await declineTestCopyrightEmailIntake()
    const { leaseToken } = await prepareCopyrightEmailDelivery(sent.intentId)
    await markCopyrightDeliveryIntentSent({
      intentId: sent.intentId,
      leaseToken,
      sesMessageId: `ses-sent-${crypto.randomUUID()}`,
    })
    const bounced = await declineTestCopyrightEmailIntake()
    await bounceTestCopyrightEmailIntakeReply(bounced.intentId)
    const staff = await createStaff()

    for (const [declined, state] of [
      [pending, 'pending'],
      [sent, 'sent'],
      [bounced, 'bounced'],
    ] as const) {
      const before = await readTestCopyrightDeliveryIntentReplayFacts(declined.intentId)
      await expect(
        replayFailedCopyrightEmailIntakeReply({ currentUser: staff, intakeId: declined.intakeId }),
      ).resolves.toBeNull()
      await expect(readTestCopyrightDeliveryIntentReplayFacts(declined.intentId)).resolves.toEqual(
        before,
      )
      expect(before.state).toBe(state)
      await expect(readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).resolves.toEqual(
        [],
      )
    }
  })

  it('resets and audits exactly once when two staff replay the same failed reply together', async () => {
    const declined = await declineWithFailedReply()
    const [first, second] = await Promise.all([createStaff(), createStaff('administrator')])

    const outcomes = await Promise.all([
      replayFailedCopyrightEmailIntakeReply({ currentUser: first, intakeId: declined.intakeId }),
      replayFailedCopyrightEmailIntakeReply({ currentUser: second, intakeId: declined.intakeId }),
    ])

    expect(outcomes.filter(Boolean)).toEqual([declined.intentId])
    const events = await readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)
    expect(events).toHaveLength(1)
    expect([first.id, second.id]).toContain(events[0]!.changed_by_id)
    await expect(
      readTestCopyrightDeliveryIntentReplayFacts(declined.intentId),
    ).resolves.toMatchObject({ state: 'pending', delivery_attempt_count: 0 })
  })

  it('retries a reply that failed again, because the guard is the failed state and not a count', async () => {
    const declined = await declineWithFailedReply()
    const staff = await createStaff()
    const replay = () =>
      replayFailedCopyrightEmailIntakeReply({ currentUser: staff, intakeId: declined.intakeId })

    await expect(replay()).resolves.toBe(declined.intentId)
    await failTestCopyrightDeliveryIntent(declined.intentId)
    await expect(replay()).resolves.toBe(declined.intentId)

    await expect(
      readTestCopyrightDeliveryIntentReplayEvents(declined.intentId),
    ).resolves.toHaveLength(2)
  })

  it('refuses a user who cannot review copyright notices and changes nothing', async () => {
    const declined = await declineWithFailedReply()
    const member = await createTestUser()

    await expect(
      replayFailedCopyrightEmailIntakeReply({ currentUser: member, intakeId: declined.intakeId }),
    ).rejects.toMatchObject({ status: 403 })

    await expect(
      readTestCopyrightDeliveryIntentReplayFacts(declined.intentId),
    ).resolves.toMatchObject({ state: 'failed' })
    await expect(readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).resolves.toEqual(
      [],
    )
  })

  it('never creates a case or a staff queue key', async () => {
    const declined = await declineWithFailedReply()
    const staff = await createStaff()
    const before = await countCopyrightStaffQueueKeysWithoutNotice()

    await replayFailedCopyrightEmailIntakeReply({ currentUser: staff, intakeId: declined.intakeId })

    expect(before).toBe(0)
    await expect(countCopyrightStaffQueueKeysWithoutNotice()).resolves.toBe(0)
  })

  it('finds nothing to replay for an unknown intake', async () => {
    await expect(
      replayFailedCopyrightEmailIntakeReply({
        currentUser: await createStaff(),
        intakeId: crypto.randomUUID(),
      }),
    ).resolves.toBeNull()
  })
})
