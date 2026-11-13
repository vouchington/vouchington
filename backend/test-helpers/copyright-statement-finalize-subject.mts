import { expect } from 'vitest'
import { markCopyrightDeliveryIntentSent } from '../services/copyright-notices/delivery-intents.mts'
import { readStatementTransportState } from './copyright-statement-transport-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

/** Finalization owns its original execution and records exactly one immutable sent result or nothing. */
export async function assertStatementFinalize(intentId: string, leaseToken: string) {
  const before = await readStatementTransportState(intentId)
  const messageId = `statement-${crypto.randomUUID()}`
  const [result] = await Promise.allSettled([
    markCopyrightDeliveryIntentSent({ intentId, leaseToken, sesMessageId: messageId }),
  ])
  const after = await readStatementTransportState(intentId)
  const sent = {
    ...before.state,
    work: {
      ...before.state.work,
      state: 'sent',
      sent_at: expect.any(String),
      updated_at: expect.any(String),
      amazon_ses_message_id: messageId,
      lease_token: null,
      leased_at: null,
      lease_expires_at: null,
    },
    results: [
      {
        attempt_id: before.state.attempts[0]!.id,
        sent_at: expect.any(String),
        failed_at: null,
        bounced_at: null,
        abandoned_at: null,
      },
    ],
  }
  const within = (value: string | null) =>
    value !== null && new Date(value) >= before.now && new Date(value) <= after.now
  const clocks =
    after.state.work.sent_at === null
      ? []
      : [
          within(after.state.work.sent_at),
          within(after.state.work.updated_at),
          within(after.state.results[0]!.sent_at),
        ]
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before.state, clocks: [] },
    { outcome: { status: 'fulfilled', value: true }, state: sent, clocks: [true, true, true] },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after.state,
    clocks,
  })
}
