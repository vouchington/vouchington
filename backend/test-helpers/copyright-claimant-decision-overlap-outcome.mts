import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightCorrespondencePurpose } from '../services/copyright-notices/correspondence.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { overlapClaimantRejectionAndReversal } from './copyright-claimant-decision-overlap.mts'

async function readDecisionOverlapState(noticeId: string, claimantId: string) {
  const legal = await readEffectiveReviewState(noticeId, [claimantId])
  const { rows: messages } = await write<{
    id: string
    direction: string
    correspondence_kind: string
    composition_kind: string
    body_ciphertext: string
  }>(sql`/* readDecisionOverlapState:messages */
    SELECT id, direction, correspondence_kind, composition_kind, body_ciphertext
    FROM copyright_notice_correspondence_messages WHERE copyright_notice_id = ${noticeId}
      AND correspondence_kind = 'decision_notice' ORDER BY id`)
  const { rows: deliveries } = await write<{
    id: string
    key: string
    message_id: string
    recipient_user_id: string | null
    recipient_role: string
    delivery_kind: string
    channel: string
    state: string
    target_id: string | null
    submission_id: string | null
    email_ciphertext: string | null
  }>(sql`/* readDecisionOverlapState:deliveries */
    SELECT delivery.id, delivery.idempotency_key AS key,
      delivery.copyright_notice_correspondence_message_id AS message_id, delivery.recipient_user_id,
      delivery.recipient_role, delivery.delivery_kind, delivery.channel, delivery.state,
      delivery.copyright_notice_target_id AS target_id, delivery.copyright_notice_submission_id AS submission_id,
      recipient.email_ciphertext
    FROM copyright_notice_delivery_work_items delivery
    LEFT JOIN copyright_notice_delivery_recipients recipient ON recipient.copyright_notice_delivery_work_item_id = delivery.id
    WHERE delivery.copyright_notice_id = ${noticeId} AND delivery.delivery_kind = 'claimant_decision_notice'
    ORDER BY delivery.idempotency_key`)
  return {
    legal,
    messages: messages.map(row => ({
      direction: row.direction,
      kind: row.correspondence_kind,
      composition: row.composition_kind,
      text: decryptSecret(row.body_ciphertext, copyrightCorrespondencePurpose(row.id)),
    })),
    deliveries: deliveries.map(row => ({
      key: row.key,
      message: messages.findIndex(message => message.id === row.message_id),
      user: row.recipient_user_id,
      role: row.recipient_role,
      kind: row.delivery_kind,
      channel: row.channel,
      state: row.state,
      target: row.target_id,
      submission: row.submission_id,
      email: row.email_ciphertext
        ? decryptSecret(row.email_ciphertext, `copyright-delivery-recipient:${row.id}`)
        : null,
    })),
  }
}

/** No stale reversal survives a competing committed rejection, and an aborted actor leaves nothing. */
export async function assertClaimantDecisionOverlap(noticeId: string, claimantId: string) {
  const before = await readDecisionOverlapState(noticeId, claimantId)
  expect(before.messages).toEqual([])
  expect(before.deliveries).toEqual([])
  const result = await overlapClaimantRejectionAndReversal(noticeId)
  const after = await readDecisionOverlapState(noticeId, claimantId)
  const fulfilled = { status: 'fulfilled' }
  const conflict = nativeCopyrightSerializationConflict
  const projected = (event: 'not_accepted' | 'reversed') => ({
    legal: {
      ...before.legal,
      state: {
        ...before.legal.state,
        correspondence: [...before.legal.state.correspondence, 'decision_notice'].toSorted(),
        deliveries: [
          ...before.legal.state.deliveries,
          `claimant_decision_notice:email:${claimantId}`,
          `claimant_decision_notice:in_app:${claimantId}`,
        ].toSorted(),
      },
    },
    messages: [
      {
        direction: 'outbound',
        kind: 'decision_notice',
        composition: 'deterministic_template',
        text: expect.stringContaining(
          event === 'not_accepted' ? 'We could not accept' : 'reversed',
        ),
      },
    ],
    deliveries: [
      {
        key: `copyright-decision:${noticeId}:${event}:claimant`,
        message: 0,
        user: claimantId,
        role: 'claimant',
        kind: 'claimant_decision_notice',
        channel: 'in_app',
        state: 'pending',
        target: null,
        submission: null,
        email: null,
      },
      {
        key: `copyright-decision:${noticeId}:${event}:claimant:email`,
        message: 0,
        user: claimantId,
        role: 'claimant',
        kind: 'claimant_decision_notice',
        channel: 'email',
        state: 'pending',
        target: null,
        submission: null,
        email: 'claimant@example.test',
      },
    ],
  })
  const outcome = (settled: PromiseSettledResult<void>) =>
    settled.status === 'fulfilled' ? fulfilled : copyrightRaceResult(settled)
  expect([
    { rejection: fulfilled, reversal: conflict, state: projected('not_accepted'), paused: true },
    { rejection: conflict, reversal: fulfilled, state: projected('reversed'), paused: true },
    { rejection: conflict, reversal: fulfilled, state: projected('reversed'), paused: false },
    { rejection: conflict, reversal: conflict, state: before, paused: true },
    { rejection: conflict, reversal: conflict, state: before, paused: false },
    { rejection: fulfilled, reversal: fulfilled, state: projected('not_accepted'), paused: true },
  ]).toContainEqual({
    rejection: outcome(result.rejection),
    reversal: outcome(result.reversal),
    state: after,
    paused: result.paused,
  })
}
