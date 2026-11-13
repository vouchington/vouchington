import { expect } from 'vitest'
import { prepareCopyrightEmailDelivery } from '../services/copyright-notices/delivery-transport.mts'
import {
  markCopyrightDeliveryIntentSent,
  markCopyrightDeliveryIntentFailed,
} from '../services/copyright-notices/delivery-intents.mts'
import { markCopyrightDeliveryIntentBouncedBySesMessageId } from '../services/copyright-notices/delivery-bounces.mts'
import { copyrightEmailSubject } from '../services/copyright-notices/statement-of-reasons-wording.mts'
import {
  readOwnedCopyrightMailWork,
  expectedOwnedMailClaim,
} from './copyright-email-work-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

export async function assertOwnedCopyrightMailPreparation(
  intentId: string,
  recipientEmail: string,
  text: string,
) {
  const before = await readOwnedCopyrightMailWork(intentId)
  const [outcome] = await Promise.allSettled([prepareCopyrightEmailDelivery(intentId)])
  const after = await readOwnedCopyrightMailWork(intentId)
  const claimed = expectedOwnedMailClaim(before)
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before, authorityMatches: null },
    { outcome: nativeCopyrightSerializationConflict, state: claimed, authorityMatches: null },
    {
      outcome: {
        status: 'fulfilled',
        value: {
          leaseToken: expect.any(String),
          deliveryKind: before.work.delivery_kind,
          correspondenceId: before.work.copyright_notice_correspondence_message_id,
          recipientEmail,
          subject: copyrightEmailSubject(before.work.delivery_kind),
          text,
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

export async function assertOwnedCopyrightProviderWrite(
  input:
    | { kind: 'sent'; intentId: string; leaseToken: string; sesMessageId: string }
    | { kind: 'failed'; intentId: string; leaseToken: string; error: string }
    | { kind: 'bounced'; intentId: string; sesMessageId: string; recipientEmail: string },
) {
  const before = await readOwnedCopyrightMailWork(input.intentId)
  const operation =
    input.kind === 'sent'
      ? () => markCopyrightDeliveryIntentSent(input)
      : input.kind === 'failed'
        ? () => markCopyrightDeliveryIntentFailed(input)
        : () =>
            markCopyrightDeliveryIntentBouncedBySesMessageId({
              sesMessageId: input.sesMessageId,
              recipientEmails: [input.recipientEmail.toUpperCase()],
            })
  const [outcome] = await Promise.allSettled([operation()])
  const state = input.kind === 'sent' ? 'sent' : input.kind === 'failed' ? 'pending' : 'bounced'
  const changed = {
    ...before,
    work: {
      ...before.work,
      state,
      updated_at: expect.any(Date),
      ...(input.kind === 'sent'
        ? {
            sent_at: expect.any(Date),
            amazon_ses_message_id: input.sesMessageId,
            lease_token: null,
            leased_at: null,
            lease_expires_at: null,
          }
        : input.kind === 'failed'
          ? {
              leased_at: null,
              lease_token: null,
              lease_expires_at: null,
              available_at: expect.any(Date),
              failure_ciphertext: expect.any(String),
            }
          : { bounced_at: expect.any(Date) }),
    },
    failure: input.kind === 'failed' ? input.error : before.failure,
    attempts: before.attempts.map((row, index) =>
      index === before.attempts.length - 1 && input.kind !== 'bounced'
        ? { ...row, sent: input.kind === 'sent', failed: input.kind === 'failed' }
        : row,
    ),
    aggregate: before.aggregate
      ? {
          ...before.aggregate,
          deliveryIntents: before.aggregate.deliveryIntents.map(row =>
            row.id === input.intentId
              ? {
                  ...row,
                  state,
                  ...(input.kind === 'sent' ? { amazon_ses_message_id: input.sesMessageId } : {}),
                }
              : row,
          ),
        }
      : null,
  }
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    {
      outcome: { status: 'fulfilled', value: input.kind === 'bounced' ? 1 : true },
      state: changed,
    },
  ]).toContainEqual({
    outcome: outcome!.status === 'fulfilled' ? outcome : copyrightRaceResult(outcome!),
    state: await readOwnedCopyrightMailWork(input.intentId),
  })
}

export async function assertOwnedCopyrightStaleMailLease(intentId: string, leaseToken: string) {
  const before = await readOwnedCopyrightMailWork(intentId)
  const [outcome] = await Promise.allSettled([
    markCopyrightDeliveryIntentSent({
      intentId,
      leaseToken,
      sesMessageId: `ses-should-not-send-${crypto.randomUUID()}`,
    }),
  ])
  expect([
    { outcome: { status: 'fulfilled', value: false }, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: before },
  ]).toContainEqual({
    outcome: outcome!.status === 'fulfilled' ? outcome : copyrightRaceResult(outcome!),
    state: await readOwnedCopyrightMailWork(intentId),
  })
}
