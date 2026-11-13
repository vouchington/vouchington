import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  createOwnedCopyrightReplyFixture,
  seedOwnedCopyrightReplyReplay,
  seedOwnedCopyrightReplyClaim,
} from '@voucha/test-helpers/copyright-reply-replay-fixtures'
import {
  assertOwnedCopyrightReplyReplay,
  assertOwnedCopyrightReplyResend,
  copyrightReplyReplayConflict,
  expectedOwnedCopyrightReplyReset,
} from '@voucha/test-helpers/copyright-reply-replay-outcomes'
import {
  readOwnedCopyrightReplyState,
  countOwnedCopyrightReplyQueueKeys,
} from '@voucha/test-helpers/copyright-reply-replay-state'
import { copyrightRaceResult } from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import { replayFailedCopyrightEmailIntakeReply } from './email-intake-reply-replay.mts'

describe('replaying the failed reply to a declined email intake', () => {
  it('atomically resets the failed reply with its exact stored body and authenticated actor audit', async () => {
    expect.hasAssertions()
    const declined = await createOwnedCopyrightReplyFixture()
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    await assertOwnedCopyrightReplyReplay(declined, staff)
  })

  it('resends a separately committed replay using the exact stored recipient, subject and text', async () => {
    expect.hasAssertions()
    const declined = await createOwnedCopyrightReplyFixture()
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    await seedOwnedCopyrightReplyReplay(declined.intentId, staff.id)
    await assertOwnedCopyrightReplyResend(declined)
  })

  it.each(['pending', 'sent', 'bounced'] as const)(
    'leaves a committed %s reply untouched and unaudited',
    async state => {
      const declined = await createOwnedCopyrightReplyFixture(state)
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const before = await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId)
      expect(before.work.state).toBe(state)
      await expect(
        replayFailedCopyrightEmailIntakeReply({ currentUser: staff, intakeId: declined.intakeId }),
      ).resolves.toBeNull()
      expect(await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId)).toEqual(
        before,
      )
      expect(before.events).toEqual([])
    },
  )

  it('never commits two resets or an unaudited reset when two staff replay together', async () => {
    const declined = await createOwnedCopyrightReplyFixture()
    const first = await createTestUser({ extraRoles: ['moderator'] })
    const second = await createTestUser({ administrator: true })
    const before = await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId)
    const [a, b] = await Promise.allSettled([
      replayFailedCopyrightEmailIntakeReply({ currentUser: first, intakeId: declined.intakeId }),
      replayFailedCopyrightEmailIntakeReply({ currentUser: second, intakeId: declined.intakeId }),
    ])
    const success = { status: 'fulfilled', value: declined.intentId }
    const noop = { status: 'fulfilled', value: null }
    expect([
      { first: success, second: noop, state: expectedOwnedCopyrightReplyReset(before, first.id) },
      {
        first: success,
        second: copyrightReplyReplayConflict,
        state: expectedOwnedCopyrightReplyReset(before, first.id),
      },
      { first: noop, second: success, state: expectedOwnedCopyrightReplyReset(before, second.id) },
      {
        first: copyrightReplyReplayConflict,
        second: success,
        state: expectedOwnedCopyrightReplyReset(before, second.id),
      },
      { first: copyrightReplyReplayConflict, second: copyrightReplyReplayConflict, state: before },
    ]).toContainEqual({
      first: a.status === 'fulfilled' ? a : copyrightRaceResult(a),
      second: b.status === 'fulfilled' ? b : copyrightRaceResult(b),
      state: await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId),
    })
  })

  it('can reset a reply that failed after a separately committed earlier replay', async () => {
    expect.hasAssertions()
    const declined = await createOwnedCopyrightReplyFixture()
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    await seedOwnedCopyrightReplyReplay(declined.intentId, staff.id)
    await seedOwnedCopyrightReplyClaim(declined.intentId)
    await failTestCopyrightDeliveryIntent(declined.intentId)
    const before = await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId)
    expect(before.events).toEqual([
      {
        copyright_notice_id: null,
        change_type: 'delivery_intent_replayed',
        changed_by_id: staff.id,
      },
    ])
    await assertOwnedCopyrightReplyReplay(declined, staff)
  })

  it('refuses a user who cannot review copyright notices and changes nothing', async () => {
    const declined = await createOwnedCopyrightReplyFixture()
    const member = await createTestUser()
    const before = await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId)
    await expect(
      replayFailedCopyrightEmailIntakeReply({ currentUser: member, intakeId: declined.intakeId }),
    ).rejects.toMatchObject({ status: 403 })
    expect(await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId)).toEqual(before)
  })

  it('creates no case or staff queue key for its owned declined intake', async () => {
    const declined = await createOwnedCopyrightReplyFixture()
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    expect(await countOwnedCopyrightReplyQueueKeys(declined.intakeId)).toBe(0)
    await assertOwnedCopyrightReplyReplay(declined, staff)
    const after = await readOwnedCopyrightReplyState(declined.intakeId, declined.intentId)
    expect(after.links).toEqual([])
    expect(after.work).toMatchObject({ copyright_notice_id: null })
    expect(after.events.every(event => event.copyright_notice_id === null)).toBe(true)
    expect(await countOwnedCopyrightReplyQueueKeys(declined.intakeId)).toBe(0)
  })

  it('finds nothing to replay for an unknown intake', async () => {
    await expect(
      replayFailedCopyrightEmailIntakeReply({
        currentUser: await createTestUser({ extraRoles: ['moderator'] }),
        intakeId: crypto.randomUUID(),
      }),
    ).resolves.toBeNull()
  })
})
