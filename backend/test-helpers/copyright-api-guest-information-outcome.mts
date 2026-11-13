import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightCorrespondencePurpose } from '../services/copyright-notices/correspondence.mts'
import type { createRequest } from './api/server.mts'
import { readApiGuestState } from './copyright-api-guest-state.mts'

/** Request text, its staff provenance, claimant email recipient and pending delivery are one transaction. */
export async function assertApiGuestInformation(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  capabilityId: string
  actorId: string
  statement: string
}) {
  const before = await readApiGuestState(input.noticeId)
  const response = await input.staff
    .post(
      `/api/v1/copyright-notices/${input.noticeId}/guest-capabilities/${input.capabilityId}/information-requests`,
    )
    .send({ statement: input.statement })
  const after = await readApiGuestState(input.noticeId)
  const message = after.aggregate.correspondence.find(
    row => !before.aggregate.correspondence.some(prior => prior.id === row.id),
  )
  const delivery = after.aggregate.deliveryIntents.find(
    row => row.copyright_notice_correspondence_message_id === message?.id,
  )
  const original = before.aggregate.deliveryIntents.find(
    row => row.delivery_kind === 'claimant_receipt' && row.channel === 'email',
  )
  const originalRecipient = before.recipients.find(row => row.id === original?.id)
  if (!original || !originalRecipient)
    throw new Error('Owned guest information scene has no email receipt authority')
  const email = decryptSecret(
    originalRecipient.email,
    `copyright-delivery-recipient:${original.id}`,
  )
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      value: undefined,
      state: before,
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      value: { id: message?.id },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        activity: { ...before.activity, lifecycle: expect.any(Date) },
        deliveryWork: [
          ...before.deliveryWork,
          expect.objectContaining({
            id: delivery?.id,
            copyright_notice_id: input.noticeId,
            copyright_notice_correspondence_message_id: message?.id,
            recipient_user_id: null,
            recipient_role: 'claimant',
            delivery_kind: 'staff_information_request',
            channel: 'email',
            state: 'pending',
            attempt_count: 0,
            idempotency_key: `copyright-correspondence:${message?.id}:claimant-information-request`,
            lease_token: null,
            leased_at: null,
            sent_at: null,
            failed_at: null,
            bounced_at: null,
          }),
        ],
        recipients: [...before.recipients, { id: delivery?.id, email: expect.any(String) }],
        aggregate: {
          ...before.aggregate,
          correspondence: [
            ...before.aggregate.correspondence,
            expect.objectContaining({
              id: message?.id,
              copyright_notice_id: input.noticeId,
              copyright_notice_submission_id: null,
              direction: 'outbound',
              correspondence_kind: 'request_information',
              composition_kind: 'staff',
              body_ciphertext: expect.any(String),
              drafted_by_id: input.actorId,
              approved_at: null,
              approved_by_id: null,
              sent_at: null,
            }),
          ],
          deliveryIntents: [
            ...before.aggregate.deliveryIntents,
            expect.objectContaining({
              id: delivery?.id,
              copyright_notice_id: input.noticeId,
              copyright_notice_submission_id: null,
              copyright_notice_correspondence_message_id: message?.id,
              recipient_user_id: null,
              recipient_role: 'claimant',
              delivery_kind: 'staff_information_request',
              channel: 'email',
              attempt_count: 0,
              state: 'pending',
              amazon_ses_message_id: null,
            }),
          ],
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              copyright_notice_id: input.noticeId,
              change_type: 'outbound_correspondence_created',
              copyright_notice_correspondence_id: message?.id,
            }),
          ],
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: response.body.copyright_correspondence,
    state: after,
  })
  if (message)
    expect(decryptSecret(message.body_ciphertext, copyrightCorrespondencePurpose(message.id))).toBe(
      input.statement,
    )
  if (delivery) {
    const recipient = after.recipients.find(row => row.id === delivery.id)
    if (!recipient)
      throw new Error('Committed guest information delivery lost its encrypted recipient')
    expect(decryptSecret(recipient.email, `copyright-delivery-recipient:${delivery.id}`)).toBe(
      email,
    )
  }
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
