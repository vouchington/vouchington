import { assertTransportClocks } from './copyright-statement-transport-clocks.mts'
import { expect } from 'vitest'
import {
  deliverCopyrightInAppNotification,
  prepareCopyrightEmailDelivery,
} from '../services/copyright-notices/delivery-transport.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { getCopyrightEmailCorrespondence } from '../services/copyright-notices/correspondence.mts'
import {
  copyrightEmailSubject,
  copyrightNotificationCopy,
  COPYRIGHT_AI_ASSISTED_SENTENCE,
} from '../services/copyright-notices/statement-of-reasons-wording.mts'
import { getCopyrightStatementInAppSummary } from '../services/copyright-notices/statement-in-app-summary.mts'
import { copyrightInAppDecisionWasAiAssisted } from '../services/copyright-notices/ai-assistance-disclosure.mts'
import { getCopyrightNoticeJurisdiction } from '../services/copyright-notices/notice-jurisdiction.mts'
import { getVerifiedEmailAddress } from '../services/contribution-gating/index.mts'
import {
  readStatementTransportState,
  statementInAppKind,
  type StatementTransportState,
} from './copyright-statement-transport-state.mts'

function claimed(before: StatementTransportState) {
  return {
    ...before,
    attempts: [
      ...before.attempts,
      {
        id: expect.any(String),
        work_item_id: before.work.id,
        generation: before.work.generation,
        attempt_number: before.work.attempt_count + 1,
        lease_token: expect.any(String),
        started_at: expect.any(String),
        created_at: expect.any(String),
      },
    ],
    work: {
      ...before.work,
      state: 'claimed',
      attempt_count: before.work.attempt_count + 1,
      lease_token: expect.any(String),
      leased_at: expect.any(String),
      lease_expires_at: expect.any(String),
      delivery_attempted_at: expect.any(String),
      available_at: expect.any(String),
      updated_at: expect.any(String),
      failure_ciphertext: null,
    },
  }
}

/** Every real claim/render/finalize attempt is coupled to its durable work, legal and notification stage. */
export async function assertStatementInAppTransport(intentId: string) {
  const before = await readStatementTransportState(intentId)
  const summary = await getCopyrightStatementInAppSummary(intentId)
  const kind = before.state.work.delivery_kind
  const copy = copyrightNotificationCopy(
    statementInAppKind(kind),
    await getCopyrightNoticeJurisdiction(before.state.work.copyright_notice_id!),
  )
  const assisted = kind === 'status_update' && (await copyrightInAppDecisionWasAiAssisted(intentId))
  const body = (summary ?? copy.body) + (assisted ? `\n\n${COPYRIGHT_AI_ASSISTED_SENTENCE}` : '')
  const notification = {
    title: copy.title,
    body,
    path:
      before.state.work.target_path ??
      `/copyright/notices/${before.state.work.copyright_notice_id}`,
    intent: null,
  }
  const leased = claimed(before.state)
  const notified = { ...leased, notifications: [notification] }
  const sent = {
    ...notified,
    results: [
      {
        attempt_id: expect.any(String),
        sent_at: expect.any(String),
        failed_at: null,
        bounced_at: null,
        abandoned_at: null,
      },
    ],
    work: {
      ...notified.work,
      state: 'sent',
      sent_at: expect.any(String),
      amazon_ses_message_id: null,
      lease_token: null,
      leased_at: null,
      lease_expires_at: null,
    },
  }
  const [result] = await Promise.allSettled([deliverCopyrightInAppNotification(intentId)])
  const after = await readStatementTransportState(intentId)
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before.state },
    { outcome: nativeCopyrightSerializationConflict, state: leased },
    { outcome: nativeCopyrightSerializationConflict, state: notified },
    { outcome: { status: 'fulfilled', value: true }, state: sent },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after.state,
  })
  assertTransportClocks(before.state, after.state, before.now, after.now)
  return { title: copy.title, body }
}

/** The real email preparation either retains nothing, owns a lease, or returns the exact private rendering. */
export async function assertStatementEmailTransport(intentId: string) {
  const before = await readStatementTransportState(intentId)
  const rendered = await getCopyrightEmailCorrespondence(intentId)
  const kind = before.state.work.delivery_kind
  const recipientEmail =
    before.state.email ??
    (before.state.work.recipient_user_id
      ? await getVerifiedEmailAddress(before.state.work.recipient_user_id)
      : null)
  expect(recipientEmail).toEqual(expect.any(String))
  const leased = claimed(before.state)
  const retained = { ...leased, email: recipientEmail }
  const [result] = await Promise.allSettled([prepareCopyrightEmailDelivery(intentId)])
  const after = await readStatementTransportState(intentId)
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before.state },
    { outcome: nativeCopyrightSerializationConflict, state: leased },
    {
      outcome: {
        status: 'fulfilled',
        value: {
          leaseToken: after.state.work.lease_token,
          deliveryKind: kind,
          correspondenceId: before.state.work.copyright_notice_correspondence_message_id,
          recipientEmail,
          subject: copyrightEmailSubject(kind),
          text: rendered.bodyText,
        },
      },
      state: retained,
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after.state,
  })
  assertTransportClocks(before.state, after.state, before.now, after.now)
  return { subject: copyrightEmailSubject(kind), text: rendered.bodyText, recipientEmail }
}
