import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  readTestCopyrightDeliveryIntentReplayEvents,
  readTestCopyrightDeliveryIntentReplayFacts,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intake-reply-replays'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  bounceTestCopyrightEmailIntakeReply,
  declineTestCopyrightEmailIntake,
} from '@voucha/test-helpers/services/copyright-notices/declined-email-intake'

const replayPath = (intakeId: string) => `/api/v1/copyright-email-intakes/${intakeId}/reply/replays`

async function createRequestFor(options?: Parameters<typeof createTestUser>[0]) {
  const user = await createTestUser(options)
  const request = createRequest()
  await request.authenticateAs(user)
  return { request, user }
}

describe('POST /api/v1/copyright-email-intakes/:id/reply/replays', () => {
  it('replays a failed reply, audits the staff actor, and finds nothing failed on a second click', async () => {
    const declined = await declineTestCopyrightEmailIntake()
    await failTestCopyrightDeliveryIntent(declined.intentId)
    const { request, user } = await createRequestFor({ extraRoles: ['moderator'] })

    const first = await request.post(replayPath(declined.intakeId)).expect(200)
    const second = await request.post(replayPath(declined.intakeId)).expect(200)

    expect(first.body).toEqual({ replayed: true })
    expect(second.body).toEqual({ replayed: false })
    await expect(
      readTestCopyrightDeliveryIntentReplayFacts(declined.intentId),
    ).resolves.toMatchObject({ state: 'pending', delivery_attempt_count: 0 })
    await expect(readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).resolves.toEqual([
      {
        copyright_notice_id: null,
        change_type: 'delivery_intent_replayed',
        changed_by_id: user.id,
      },
    ])
  })

  it('leaves a bounced reply terminal and an unknown intake alone', async () => {
    const declined = await declineTestCopyrightEmailIntake()
    await bounceTestCopyrightEmailIntakeReply(declined.intentId)
    const { request } = await createRequestFor({ extraRoles: ['administrator'] })

    const bounced = await request.post(replayPath(declined.intakeId)).expect(200)
    const unknown = await request.post(replayPath(crypto.randomUUID())).expect(200)

    expect([bounced.body, unknown.body]).toEqual([{ replayed: false }, { replayed: false }])
    await expect(
      readTestCopyrightDeliveryIntentReplayFacts(declined.intentId),
    ).resolves.toMatchObject({ state: 'bounced' })
    await expect(readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).resolves.toEqual(
      [],
    )
  })

  it('refuses anonymous callers and members without a review role, changing nothing', async () => {
    const declined = await declineTestCopyrightEmailIntake()
    await failTestCopyrightDeliveryIntent(declined.intentId)
    const { request: member } = await createRequestFor()
    const { request: moderator } = await createRequestFor({ extraRoles: ['moderator'] })

    await createRequest().post(replayPath(declined.intakeId)).expect(401)
    await member.post(replayPath(declined.intakeId)).expect(403)
    await moderator.post(replayPath('not-a-uuid')).expect(422)

    await expect(
      readTestCopyrightDeliveryIntentReplayFacts(declined.intentId),
    ).resolves.toMatchObject({ state: 'failed' })
    await expect(readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).resolves.toEqual(
      [],
    )
  })
})
