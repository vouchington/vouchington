import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import type { SqsMessage } from '@backend/worker-runtime'
import {
  createTestRejectedCopyrightResponse,
  readTestCopyrightDeliveryIntentState,
} from '@voucha/test-helpers/copyright-lease-fencing'
import { processSendCopyrightNoticeEmail } from '../../emails/processors/copyright-notice.mts'
import { processSesBounceSqsMessage } from '../processors.mts'

function bounce(messageId: string, emailAddress: string): SqsMessage {
  return {
    messageId: `test-${crypto.randomUUID()}`,
    receiptHandle: `receipt-${crypto.randomUUID()}`,
    body: JSON.stringify({
      eventType: 'Bounce',
      mail: { messageId, timestamp: '2024-01-01T00:00:00.000Z' },
      bounce: {
        bounceType: 'Permanent',
        bounceSubType: 'General',
        bouncedRecipients: [{ emailAddress, diagnosticCode: '550 5.1.1 User unknown' }],
        timestamp: '2024-01-01T00:00:01.000Z',
        feedbackId: `fb-${crypto.randomUUID()}`,
        reportingMTA: 'smtp.example.com',
      },
    }),
  }
}

// A reply to a declined email intake has no case, so only its own recipient row can match a bounce.
describe('a bounce of a copyright email intake reply', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('marks the sent reply bounced when the bounced recipient is its addressee', async () => {
    const sesMessageId = `ses-${crypto.randomUUID()}`
    const sendEmail = vi
      .spyOn(ses, 'sendEmail')
      .mockResolvedValue({ MessageId: sesMessageId } as never)
    const intentId = await createTestRejectedCopyrightResponse()
    await expect(processSendCopyrightNoticeEmail({ intentId })).resolves.toBe(true)
    const recipient = (sendEmail.mock.calls[0]![0] as { to: string }).to

    await processSesBounceSqsMessage(bounce(sesMessageId, 'someone-else@example.test'))
    await expect(readTestCopyrightDeliveryIntentState(intentId)).resolves.toBe('sent')

    await processSesBounceSqsMessage(bounce(sesMessageId, recipient.toUpperCase()))
    await expect(readTestCopyrightDeliveryIntentState(intentId)).resolves.toBe('bounced')
  })
})
