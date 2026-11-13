import { expect } from 'vitest'
import type { PrivateUser } from '../services/users/types.mts'
import { replayFailedCopyrightEmailIntakeReply } from '../services/copyright-notices/email-intake-reply-replay.mts'
import { prepareCopyrightEmailDelivery } from '../services/copyright-notices/delivery-transport.mts'
import { decryptCopyrightEmailIntakeResponseBody } from '../services/copyright-notices/email-intake-reply.mts'
import { copyrightEmailSubject } from '../services/copyright-notices/statement-of-reasons-wording.mts'
import {
  readOwnedCopyrightReplyState,
  ownedCopyrightReplyRecipient,
} from './copyright-reply-replay-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

export const copyrightReplyReplayConflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright case change',
  causeCode: '40001',
}
type State = Awaited<ReturnType<typeof readOwnedCopyrightReplyState>>
type Owner = { intakeId: string; intentId: string }
export function expectedOwnedCopyrightReplyReset(before: State, actorId: string) {
  return {
    ...before,
    work: {
      ...before.work,
      state: 'pending',
      attempt_count: 0,
      failed_at: null,
      leased_at: null,
      lease_token: null,
      lease_expires_at: null,
      failure_ciphertext: null,
      available_at: expect.any(Date),
      updated_at: expect.any(Date),
      generation: String(BigInt(before.work.generation) + 1n),
    },
    events: [
      ...before.events,
      {
        copyright_notice_id: null,
        change_type: 'delivery_intent_replayed',
        changed_by_id: actorId,
      },
    ],
  }
}

export async function assertOwnedCopyrightReplyReplay(owner: Owner, staff: PrivateUser) {
  const before = await readOwnedCopyrightReplyState(owner.intakeId, owner.intentId)
  expect(before.work.state).toBe('failed')
  const [outcome] = await Promise.allSettled([
    replayFailedCopyrightEmailIntakeReply({ currentUser: staff, intakeId: owner.intakeId }),
  ])
  expect([
    {
      outcome: { status: 'fulfilled', value: owner.intentId },
      state: expectedOwnedCopyrightReplyReset(before, staff.id),
    },
    { outcome: copyrightReplyReplayConflict, state: before },
  ]).toContainEqual({
    outcome: outcome!.status === 'fulfilled' ? outcome : copyrightRaceResult(outcome!),
    state: await readOwnedCopyrightReplyState(owner.intakeId, owner.intentId),
  })
}

/** A separately committed reset always reaches the actual resend subject, independent of another race. */
export async function assertOwnedCopyrightReplyResend(owner: Owner) {
  const before = await readOwnedCopyrightReplyState(owner.intakeId, owner.intentId)
  const [outcome] = await Promise.allSettled([prepareCopyrightEmailDelivery(owner.intentId)])
  const after = await readOwnedCopyrightReplyState(owner.intakeId, owner.intentId)
  const claimed = {
    ...before,
    work: {
      ...before.work,
      state: 'claimed',
      delivery_attempted_at: expect.any(Date),
      attempt_count: 1,
      lease_token: expect.any(String),
      leased_at: expect.any(Date),
      lease_expires_at: expect.any(Date),
      available_at: expect.any(Date),
      updated_at: expect.any(Date),
    },
    attempts: [
      ...before.attempts,
      {
        attempt_number: 2,
        generation: before.work.generation,
        sent: false,
        failed: false,
        abandoned: false,
      },
    ],
  }
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before, authorityMatches: null },
    // Recipient retention is a second transaction after the delivery lease has committed.
    { outcome: nativeCopyrightSerializationConflict, state: claimed, authorityMatches: null },
    {
      outcome: {
        status: 'fulfilled',
        value: {
          leaseToken: expect.any(String),
          deliveryKind: 'email_intake_needs_information',
          correspondenceId: null,
          recipientEmail: ownedCopyrightReplyRecipient(before),
          subject: copyrightEmailSubject('email_intake_needs_information'),
          text: decryptCopyrightEmailIntakeResponseBody(
            owner.intentId,
            before.work.body_ciphertext,
          ),
        },
      },
      state: claimed,
      authorityMatches: true,
    },
  ]).toContainEqual({
    outcome: outcome!.status === 'fulfilled' ? outcome : copyrightRaceResult(outcome!),
    state: after,
    authorityMatches:
      outcome!.status === 'fulfilled' ? outcome!.value.leaseToken === after.work.lease_token : null,
  })
}
