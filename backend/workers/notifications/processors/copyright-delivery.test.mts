import { describe, expect, it, vi } from 'vitest'
import type {
  enqueueSendCopyrightEmailIntakeResponse,
  enqueueSendCopyrightNoticeEmail,
} from '@queues/emails/enqueues'
import type { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import type { listRecoverableCopyrightDeliveryIntents } from '@services/copyright-notices/delivery-intents'
import type { listRecoverableCopyrightEmailIntakeResponses } from '@services/copyright-notices/email-intake-responses'
import { processReconcileCopyrightDeliveryIntents } from './copyright-delivery.mts'

describe('copyright delivery reconciliation', () => {
  it('routes each durable intent to its channel worker', async () => {
    const list = vi.fn<typeof listRecoverableCopyrightDeliveryIntents>().mockResolvedValue([
      {
        id: '00000000-0000-7000-8000-000000000011',
        copyright_notice_id: '00000000-0000-7000-8000-000000000012',
        copyright_notice_submission_id: null,
        copyright_notice_correspondence_message_id: null,
        recipient_user_id: '00000000-0000-7000-8000-000000000013',
        recipient_role: 'poster',
        delivery_kind: 'poster_restriction_notice',
        channel: 'in_app',
        state: 'pending',
        ses_message_id: null,
        delivery_attempt_count: 0,
      },
      {
        id: '00000000-0000-7000-8000-000000000014',
        copyright_notice_id: '00000000-0000-7000-8000-000000000012',
        copyright_notice_submission_id: null,
        copyright_notice_correspondence_message_id: '00000000-0000-7000-8000-000000000015',
        recipient_user_id: null,
        recipient_role: 'claimant',
        delivery_kind: 'claimant_receipt',
        channel: 'email',
        state: 'pending',
        ses_message_id: null,
        delivery_attempt_count: 1,
      },
    ])
    const enqueueInApp = vi.fn<typeof enqueueDeliverCopyrightNotice>().mockResolvedValue(undefined)
    const enqueueEmail = vi
      .fn<typeof enqueueSendCopyrightNoticeEmail>()
      .mockResolvedValue(undefined)
    const listResponses = vi
      .fn<typeof listRecoverableCopyrightEmailIntakeResponses>()
      .mockResolvedValue([{ id: '00000000-0000-7000-8000-000000000016' }])
    const enqueueResponse = vi
      .fn<typeof enqueueSendCopyrightEmailIntakeResponse>()
      .mockResolvedValue(undefined)

    await expect(
      processReconcileCopyrightDeliveryIntents({
        listRecoverableCopyrightDeliveryIntents: list,
        enqueueDeliverCopyrightNotice: enqueueInApp,
        enqueueSendCopyrightNoticeEmail: enqueueEmail,
        listRecoverableCopyrightEmailIntakeResponses: listResponses,
        enqueueSendCopyrightEmailIntakeResponse: enqueueResponse,
      }),
    ).resolves.toEqual({ enqueued: 3 })
    expect(enqueueInApp).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000011')
    expect(enqueueEmail).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000014')
    expect(enqueueResponse).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000016')
  })
})
