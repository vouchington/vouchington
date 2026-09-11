import { describe, expect, it } from 'vitest'
import type { SqsMessage } from '@backend/worker-runtime'
import { isEmailSuppressed } from '@services/ses-bounce-events'
import { countSesBounceEventsBySesMessageId } from '@voucha/test-helpers/entities/ses-bounce-events'
import { processSesBounceSqsMessage } from '../processors.mts'

function sqsMessage(body: unknown): SqsMessage {
  return {
    messageId: `test-${Math.random().toString(36).slice(2)}`,
    body: JSON.stringify(body),
    receiptHandle: `receipt-${Math.random().toString(36).slice(2)}`,
  }
}

describe('processSesBounceSqsMessage', () => {
  // The real configuration-set event destination (vouchington-infra/opentofu/ses.tf) publishes `eventType`, not
  // `notificationType` -- see AWS's event-publishing docs. This is the shape production traffic
  // actually arrives in.
  it('maps a bounce notification via the eventType field (real configuration-set payload shape)', async () => {
    const email = `tests+processor-bounce-event-type-${Math.random().toString(36).slice(2)}@voucha.ai`
    const messageId = `msg-${Math.random().toString(36).slice(2)}`

    await processSesBounceSqsMessage(
      sqsMessage({
        eventType: 'Bounce',
        mail: { messageId, timestamp: '2024-01-01T00:00:00.000Z' },
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [{ emailAddress: email, diagnosticCode: '550 5.1.1 User unknown' }],
          timestamp: '2024-01-01T00:00:01.000Z',
          feedbackId: `fb-${Math.random().toString(36).slice(2)}`,
          reportingMTA: 'smtp.example.com',
        },
      }),
    )

    expect(await isEmailSuppressed(email)).toBe(true)
    expect(await countSesBounceEventsBySesMessageId(messageId)).toBe(1)
  })

  // `notificationType` is only used when event publishing isn't configured for the identity --
  // not the production path here, but kept as a fallback (see processors.mts) and covered here.
  it('maps a bounce notification via the legacy notificationType field', async () => {
    const email = `tests+processor-bounce-${Math.random().toString(36).slice(2)}@voucha.ai`
    const messageId = `msg-${Math.random().toString(36).slice(2)}`

    await processSesBounceSqsMessage(
      sqsMessage({
        notificationType: 'Bounce',
        mail: { messageId, timestamp: '2024-01-01T00:00:00.000Z' },
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [{ emailAddress: email, diagnosticCode: '550 5.1.1 User unknown' }],
          timestamp: '2024-01-01T00:00:01.000Z',
          feedbackId: `fb-${Math.random().toString(36).slice(2)}`,
          reportingMTA: 'smtp.example.com',
        },
      }),
    )

    expect(await isEmailSuppressed(email)).toBe(true)
    expect(await countSesBounceEventsBySesMessageId(messageId)).toBe(1)
  })

  it('prefers eventType over notificationType when both are present', async () => {
    const email = `tests+processor-both-fields-${Math.random().toString(36).slice(2)}@voucha.ai`
    const messageId = `msg-${Math.random().toString(36).slice(2)}`

    await processSesBounceSqsMessage(
      sqsMessage({
        eventType: 'Bounce',
        notificationType: 'Nonsense',
        mail: { messageId, timestamp: '2024-01-01T00:00:00.000Z' },
        bounce: {
          bounceType: 'Permanent',
          bouncedRecipients: [{ emailAddress: email }],
          timestamp: '2024-01-01T00:00:01.000Z',
        },
      }),
    )

    expect(await countSesBounceEventsBySesMessageId(messageId)).toBe(1)
  })

  it('maps a complaint notification and suppresses the recipient', async () => {
    const email = `tests+processor-complaint-${Math.random().toString(36).slice(2)}@voucha.ai`
    const messageId = `msg-${Math.random().toString(36).slice(2)}`

    await processSesBounceSqsMessage(
      sqsMessage({
        notificationType: 'Complaint',
        mail: { messageId, timestamp: '2024-01-01T00:00:00.000Z' },
        complaint: {
          complainedRecipients: [{ emailAddress: email }],
          timestamp: '2024-01-01T00:00:01.000Z',
          feedbackId: `fb-${Math.random().toString(36).slice(2)}`,
        },
      }),
    )

    expect(await isEmailSuppressed(email)).toBe(true)
    expect(await countSesBounceEventsBySesMessageId(messageId)).toBe(1)
  })

  it('maps a delivery notification with multiple recipients', async () => {
    const messageId = `msg-${Math.random().toString(36).slice(2)}`

    await processSesBounceSqsMessage(
      sqsMessage({
        notificationType: 'Delivery',
        mail: { messageId, timestamp: '2024-01-01T00:00:00.000Z' },
        delivery: {
          recipients: ['tests+delivery-a@voucha.ai', 'tests+delivery-b@voucha.ai'],
          timestamp: '2024-01-01T00:00:01.000Z',
          reportingMTA: 'smtp.example.com',
        },
      }),
    )

    expect(await countSesBounceEventsBySesMessageId(messageId)).toBe(1)
  })

  it('deduplicates redelivery of the same message so only one row lands', async () => {
    const email = `tests+processor-redelivery-${Math.random().toString(36).slice(2)}@voucha.ai`
    const messageId = `msg-${Math.random().toString(36).slice(2)}`
    const notification = {
      notificationType: 'Bounce',
      mail: { messageId, timestamp: '2024-01-01T00:00:00.000Z' },
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [{ emailAddress: email }],
        timestamp: '2024-01-01T00:00:01.000Z',
      },
    }

    await processSesBounceSqsMessage(sqsMessage(notification))
    // Redelivery must not throw: createSesBounceEvent() resolves the conflict to `null`,
    // and the processor discards its return value, so a second call is a plain no-op.
    await expect(processSesBounceSqsMessage(sqsMessage(notification))).resolves.toBeUndefined()

    expect(await countSesBounceEventsBySesMessageId(messageId)).toBe(1)
  })

  it('throws on an unrecognized notificationType so SQS redelivery routes to the DLQ', async () => {
    await expect(
      processSesBounceSqsMessage(sqsMessage({ notificationType: 'Nonsense' })),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('throws on an unrecognized eventType so SQS redelivery routes to the DLQ', async () => {
    await expect(
      processSesBounceSqsMessage(sqsMessage({ eventType: 'Send' })),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('throws SyntaxError when the message body is not valid JSON', async () => {
    await expect(
      processSesBounceSqsMessage({
        messageId: 'bad-json',
        body: '{not json',
        receiptHandle: 'receipt',
      }),
    ).rejects.toThrow(SyntaxError)
  })
})
